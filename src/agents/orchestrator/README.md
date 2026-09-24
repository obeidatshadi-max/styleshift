# orchestrator agent

Routes a request to the other agents and merges their results. Deterministic router first (live turn -> doctor; session end -> behaviorAnalyst then coach).

Status: wired — live via /api/simulation/{start,message,end} and TextSimulation.tsx.
