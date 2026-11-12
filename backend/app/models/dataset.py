import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    filename = Column(String(255), nullable=False)
    raw_file_path = Column(String(500), nullable=False)
    cleaned_file_path = Column(String(500), nullable=True)
    file_size_bytes = Column(Integer, default=0)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    status = Column(String(50), default="raw")  # raw, profiled, wrangled, error
    column_mapping = Column(JSON, nullable=True)  # user or auto detected standard mapping
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    profile = relationship("DatasetProfile", back_populates="dataset", uselist=False, cascade="all, delete-orphan")
    wrangling_summary = relationship("WranglingSummary", back_populates="dataset", uselist=False, cascade="all, delete-orphan")
    anomaly_runs = relationship("AnomalyRun", back_populates="dataset", cascade="all, delete-orphan", order_by="desc(AnomalyRun.created_at)")


class DatasetProfile(Base):
    __tablename__ = "dataset_profiles"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, unique=True)
    profile_data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    dataset = relationship("Dataset", back_populates="profile")


class WranglingSummary(Base):
    __tablename__ = "wrangling_summaries"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, unique=True)
    summary_data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    dataset = relationship("Dataset", back_populates="wrangling_summary")


class AnomalyRun(Base):
    __tablename__ = "anomaly_runs"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    primary_variable = Column(String(100), default="temperature", nullable=False)
    config = Column(JSON, nullable=False)
    total_records = Column(Integer, default=0)
    confirmed_count = Column(Integer, default=0)
    potential_count = Column(Integer, default=0)
    normal_count = Column(Integer, default=0)
    severity_breakdown = Column(JSON, nullable=False)
    detector_breakdown = Column(JSON, nullable=False)
    anomalies_data = Column(JSON, nullable=False)  # List of full anomaly records
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    dataset = relationship("Dataset", back_populates="anomaly_runs")
