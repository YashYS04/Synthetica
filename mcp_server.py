import sys
from mcp.server.fastmcp import FastMCP
from config import get_genai_client
from agents import MarketResearcher, MarketingAuditAgent

# Initialize FastMCP Server
mcp = FastMCP("Synthetica Market Sandbox Tools")

@mcp.tool()
def research_market(idea: str, industry: str) -> str:
    """
    Perform a search-grounded competitor research and market landscape analysis for a given startup idea.
    """
    print(f"MCP Action: Researching {industry} market for idea: {idea[:60]}...", file=sys.stderr)
    client = get_genai_client()
    researcher = MarketResearcher(client)
    report = researcher.research(idea, industry)
    return report

@mcp.tool()
def audit_pitch(idea: str, industry: str) -> str:
    """
    Perform a copywriting and marketing value audit on a startup idea, indicating strengths, weaknesses, and copywriting suggestions.
    """
    print(f"MCP Action: Auditing pitch for idea: {idea[:60]}...", file=sys.stderr)
    client = get_genai_client()
    auditor = MarketingAuditAgent(client)
    audit = auditor.audit(idea, industry)
    return audit.model_dump_json(indent=2)

if __name__ == "__main__":
    print("Starting Synthetica MCP Server over stdio...", file=sys.stderr)
    mcp.run(transport="stdio")
