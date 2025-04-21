from fastapi import APIRouter

router = APIRouter()

@router.get("/completions_per_step")
def completions_per_step():
    return {"step_1": 45, "step_2": 40}
