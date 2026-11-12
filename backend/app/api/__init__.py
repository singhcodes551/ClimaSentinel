from fastapi import APIRouter
from app.api.health import router as health_router
from app.api.datasets import router as datasets_router
from app.api.detection import router as detection_router
from app.api.eda import router as eda_router
from app.api.evaluation import router as evaluation_router
from app.api.insights import router as insights_router
from app.api.reports import router as reports_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["Health"])
api_router.include_router(datasets_router, tags=["Datasets"])
api_router.include_router(detection_router, tags=["Anomaly Detection"])
api_router.include_router(eda_router, tags=["Exploratory Data Analysis"])
api_router.include_router(evaluation_router, tags=["Model Evaluation & Comparison"])
api_router.include_router(insights_router, tags=["Insights"])
api_router.include_router(reports_router, tags=["Reports"])

__all__ = ["api_router"]
