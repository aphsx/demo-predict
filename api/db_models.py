"""
SQLAlchemy 2.0 ORM models — mirrors db/init.sql
"""

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime,
    Float, ForeignKey, Integer, Numeric, String, Text,
    func,
)
from sqlalchemy.orm import relationship

from api.database import Base


class Customer(Base):
    __tablename__ = "customers"

    acc_id         = Column(String(20), primary_key=True)
    status         = Column(String(20),  nullable=False, default="trial")
    credit         = Column(Integer,     nullable=False, default=0)
    credit_premium = Column(Integer,     nullable=False, default=0)
    credit_email   = Column(Integer,     nullable=False, default=0)
    expire         = Column(Date)
    join_date      = Column(Date)
    last_access    = Column(DateTime)
    last_send      = Column(DateTime)
    paid_email     = Column(String(20))
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, server_default=func.now(), onupdate=func.now())

    payments   = relationship("Payment",    back_populates="customer", lazy="select")
    prediction = relationship("Prediction", back_populates="customer", uselist=False)


class Payment(Base):
    __tablename__ = "payments"

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    acc_id       = Column(String(20), ForeignKey("customers.acc_id", ondelete="CASCADE"), nullable=False)
    payment_date = Column(DateTime, nullable=False)
    amount       = Column(Numeric(14, 2), default=0)
    sms_volume   = Column(Integer, default=0)
    product_name = Column(String(100))
    credit_type  = Column(String(50))
    created_at   = Column(DateTime, server_default=func.now())

    customer = relationship("Customer", back_populates="payments")


class Prediction(Base):
    __tablename__ = "predictions"

    acc_id                 = Column(String(20), ForeignKey("customers.acc_id", ondelete="CASCADE"), primary_key=True)
    churn_probability      = Column(Float,   nullable=False, default=0)
    churn_predicted        = Column(Boolean, nullable=False, default=False)
    risk_tier              = Column(String(10), nullable=False, default="Low")
    rfm_segment            = Column(String(30))
    risk_factor            = Column(Text)
    recommended_action     = Column(Text)
    days_since_last_access = Column(Float)
    days_until_expire      = Column(Float)
    account_age_days       = Column(Float)
    total_payments         = Column(Float, default=0)
    total_amount_paid      = Column(Float, default=0)
    ltv                    = Column(Float, default=0)
    avg_amount_per_tx      = Column(Float, default=0)
    last_payment_recency   = Column(Float)
    avg_payment_gap_days   = Column(Float)
    total_sms_volume       = Column(Float, default=0)
    avg_sms_volume         = Column(Float, default=0)
    unique_products        = Column(Float, default=0)
    downgraded             = Column(Integer, default=0)
    churned                = Column(Integer, default=0)
    computed_at            = Column(DateTime, server_default=func.now())

    customer = relationship("Customer", back_populates="prediction")
