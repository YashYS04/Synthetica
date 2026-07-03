import os
from dotenv import load_dotenv
from google import genai

# Load .env file if it exists
load_dotenv()

# Model Definitions
# We use gemini-2.5-flash for faster responses and lower costs
# We use gemini-2.5-pro for complex audits or syntheses
FLASH_MODEL = "gemini-2.5-flash"
PRO_MODEL = "gemini-2.5-pro"

def get_genai_client() -> genai.Client:
    """
    Initializes and returns the unified GenAI Client.
    Supports both Google AI Studio (via GEMINI_API_KEY) and Vertex AI (via vertexai=True).
    """
    # 1. Check if Vertex AI configuration is requested
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "false").lower() == "true"
    vertex_project = os.getenv("VERTEX_PROJECT")
    vertex_location = os.getenv("VERTEX_LOCATION", "us-central1")

    if use_vertex or vertex_project:
        print(f"Initializing GenAI Client for Vertex AI (Project: {vertex_project}, Location: {vertex_location})...")
        return genai.Client(
            vertexai=True,
            project=vertex_project,
            location=vertex_location
        )
    
    # 2. Default to Google AI Studio API Key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        # Check if the environment variable is populated by local execution settings
        api_key = os.getenv("GOOGLE_API_KEY")
        
    if not api_key:
        print("WARNING: GEMINI_API_KEY is not set. The client will try to load default credentials.")
        return genai.Client()
    
    print("Initializing GenAI Client for Google AI Studio...")
    return genai.Client(api_key=api_key)
