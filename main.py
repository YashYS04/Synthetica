import json
import asyncio
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from config import get_genai_client
from agents import SecurityGuardrail
from simulation import SimulationSession, active_sessions

app = FastAPI(title="Synthetica - The Agentic Market Sandbox")

# Allow CORS for development ease
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StartSimulationRequest(BaseModel):
    idea: str
    industry: str
    persona_count: int = 5

class PitchRequest(BaseModel):
    message: str

@app.post("/api/start")
async def start_simulation(req: StartSimulationRequest, background_tasks: BackgroundTasks):
    if not req.idea.strip():
        raise HTTPException(status_code=400, detail="Idea cannot be empty")
    if not req.industry.strip():
        raise HTTPException(status_code=400, detail="Industry cannot be empty")
        
    # Run security guardrail checks
    try:
        client = get_genai_client()
        guardrail = SecurityGuardrail(client)
        is_idea_safe = await asyncio.to_thread(guardrail.check_input, req.idea)
        is_industry_safe = await asyncio.to_thread(guardrail.check_input, req.industry)
        
        if not is_idea_safe or not is_industry_safe:
            raise HTTPException(status_code=400, detail="Input violates safety guardrails (Prompt injection or abuse detected).")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Guardrail bypass warning: {e}")

    # Create a new session
    session = SimulationSession(
        idea=req.idea,
        industry=req.industry,
        persona_count=req.persona_count
    )
    active_sessions[session.session_id] = session
    
    # Run the simulation loop in the background
    background_tasks.add_task(session.start_simulation)
    
    return {"session_id": session.session_id}

@app.get("/api/stream/{session_id}")
async def stream_session(session_id: str):
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
        
    session = active_sessions[session_id]
    
    async def event_generator():
        try:
            while True:
                # Wait for an event from the session's queue
                event = await session.event_queue.get()
                event_name = event["event"]
                event_data = event["data"]
                
                yield f"event: {event_name}\ndata: {json.dumps(event_data)}\n\n"
                
                # Signal the queue that the item is processed
                session.event_queue.task_done()
                
                if event_name == "done":
                    break
        except asyncio.CancelledError:
            print(f"Client disconnected from stream {session_id}")
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/pitch/{session_id}")
async def user_pitch(session_id: str, req: PitchRequest, background_tasks: BackgroundTasks):
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
        
    session = active_sessions[session_id]
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
        
    # Run security guardrail check
    try:
        guardrail = SecurityGuardrail(session.client)
        is_safe = await asyncio.to_thread(guardrail.check_input, req.message)
        if not is_safe:
            raise HTTPException(status_code=400, detail="Input violates safety guardrails (Prompt injection or abuse detected).")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Guardrail bypass warning: {e}")

    # Add user pitch handling to background tasks
    background_tasks.add_task(session.handle_user_pitch, req.message)
    return {"status": "pitch_received"}

@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
        
    session = active_sessions[session_id]
    
    return {
        "session_id": session.session_id,
        "idea": session.idea,
        "industry": session.industry,
        "persona_count": session.persona_count,
        "personas": [p.model_dump() for p in session.personas],
        "transcript": session.transcript,
        "research_report": session.research_report,
        "marketing_audit": session.marketing_audit,
        "is_completed": session.is_completed
    }

# Mount the static files directory to serve the frontend
# Note: StaticFiles must be mounted last so that it doesn't shadow api paths
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    import os
    
    # Create the static directory if it doesn't exist
    os.makedirs("static", exist_ok=True)
    
    # Start uvicorn server on port 8000
    # Standard Cloud Run environment injects the PORT env variable
    port = int(os.getenv("PORT", 8000))
    print(f"Starting Synthetica Server on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
