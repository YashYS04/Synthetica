import asyncio
import json
import traceback
from uuid import uuid4
from config import get_genai_client
from agents import (
    MarketResearcher,
    PersonaGenerator,
    PersonaAgent,
    MarketingAuditAgent,
    Persona,
    PersonaResponse
)

# Global in-memory storage for active simulation sessions
active_sessions: dict[str, 'SimulationSession'] = {}

class SimulationSession:
    def __init__(self, idea: str, industry: str, persona_count: int = 5):
        self.session_id = str(uuid4())
        self.idea = idea
        self.industry = industry
        self.persona_count = persona_count
        
        self.client = get_genai_client()
        self.researcher = MarketResearcher(self.client)
        self.generator = PersonaGenerator(self.client)
        self.auditor = MarketingAuditAgent(self.client)
        
        self.personas: list[Persona] = []
        self.persona_agents: dict[str, PersonaAgent] = {}
        self.transcript: list[dict] = []
        self.research_report: str = ""
        self.marketing_audit: dict = {}
        
        # Event queue to bridge the simulation thread with the SSE stream
        self.event_queue = asyncio.Queue()
        self.is_completed = False

    def put_event(self, event_type: str, data: dict):
        """Helper to place an event into the queue for the SSE client."""
        asyncio.get_event_loop().call_soon_threadsafe(
            self.event_queue.put_nowait,
            {"event": event_type, "data": data}
        )

    async def start_simulation(self):
        """Runs the entire simulation workflow in a background thread."""
        try:
            # 1. Start Market Research
            self.put_event("status_update", {"message": "Conducting search-grounded market research..."})
            self.put_event("research_started", {})
            
            # Run blocking API call in a thread
            self.research_report = await asyncio.to_thread(
                self.researcher.research, self.idea, self.industry
            )
            self.put_event("research_completed", {"report": self.research_report})

            # 2. Start Persona Generation
            self.put_event("status_update", {"message": "Synthesizing target customer personas..."})
            self.put_event("personas_started", {})
            
            self.personas = await asyncio.to_thread(
                self.generator.generate_personas, self.idea, self.persona_count
            )
            
            # Instantiate the agents
            for p in self.personas:
                self.persona_agents[p.id] = PersonaAgent(self.client, p)
                
            personas_json = [p.model_dump() for p in self.personas]
            self.put_event("personas_completed", {"personas": personas_json})

            # 3. Start Marketing Copy/UX Audit
            self.put_event("status_update", {"message": "Auditing landing page pitch and copy..."})
            self.put_event("audit_started", {})
            
            audit_result = await asyncio.to_thread(
                self.auditor.audit, self.idea, self.industry
            )
            self.marketing_audit = audit_result.model_dump()
            self.put_event("audit_completed", {"audit": self.marketing_audit})

            # 4. Start the Debate
            self.put_event("status_update", {"message": "Opening the customer panel debate..."})
            self.put_event("debate_started", {})
            
            # We run 2 full rounds of debate where each persona gets to speak once per round
            debate_rounds = 2
            for rd in range(1, debate_rounds + 1):
                self.put_event("status_update", {"message": f"Running debate round {rd} of {debate_rounds}..."})
                
                for p_id, agent in self.persona_agents.items():
                    # Notify frontend that this specific persona is thinking
                    self.put_event("persona_thinking", {"persona_id": p_id})
                    
                    # Small artificial delay to make it feel human and readable
                    await asyncio.sleep(1.5)
                    
                    # Persona speaks
                    response: PersonaResponse = await asyncio.to_thread(
                        agent.speak, self.idea, self.transcript
                    )
                    
                    # Record message in session history
                    msg_payload = {
                        "sender_id": p_id,
                        "sender_name": agent.profile.name,
                        "sender_avatar": agent.profile.avatar,
                        "message": response.message,
                        "sentiment_change_reason": response.sentiment_change_reason,
                        "sentiment": response.new_sentiment
                    }
                    self.transcript.append(msg_payload)
                    
                    # Notify frontend
                    self.put_event("persona_speak", msg_payload)
            
            self.put_event("status_update", {"message": "Simulation completed successfully!"})
            self.put_event("simulation_completed", {})
            
        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"Error in simulation {self.session_id}: {error_trace}")
            self.put_event("error", {"message": str(e), "trace": error_trace})
        finally:
            self.is_completed = True


    async def handle_user_pitch(self, user_message: str):
        """Allows the user to pitch a feature or pricing pivot, prompting immediate persona responses."""
        if not self.personas:
            return {"error": "Simulation has not generated personas yet."}

        self.put_event("status_update", {"message": "User pitched a pivot. Personas are reacting..."})
        
        # We append user message to the transcript
        user_payload = {
            "sender_id": "user",
            "sender_name": "Product Owner",
            "sender_avatar": "👑",
            "message": user_message,
            "sentiment_change_reason": "User input",
            "sentiment": 1.0
        }
        self.transcript.append(user_payload)
        self.put_event("persona_speak", user_payload)

        # We trigger each persona to speak once in response to the user's pitch
        # To make it responsive, we run them sequentially
        async def prompt_agent(p_id, agent):
            self.put_event("persona_thinking", {"persona_id": p_id})
            await asyncio.sleep(1.0)
            
            response: PersonaResponse = await asyncio.to_thread(
                agent.speak, self.idea, self.transcript, user_pitch=user_message
            )
            
            msg_payload = {
                "sender_id": p_id,
                "sender_name": agent.profile.name,
                "sender_avatar": agent.profile.avatar,
                "message": response.message,
                "sentiment_change_reason": response.sentiment_change_reason,
                "sentiment": response.new_sentiment
            }
            self.transcript.append(msg_payload)
            self.put_event("persona_speak", msg_payload)

        # Run them in the background task loop
        for p_id, agent in self.persona_agents.items():
            await prompt_agent(p_id, agent)

        self.put_event("status_update", {"message": "Personas have finished reacting."})
        self.put_event("pitch_completed", {})
