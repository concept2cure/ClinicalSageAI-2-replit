#!/usr/bin/env python3
"""
Final training run: build RandomForest model from clean dataset
"""
import pandas as pd
import os
import pickle
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score, classification_report

print("Starting final model training with validated dataset...")

# Load dataset
df = pd.read_csv("data/csr_dataset.csv")
print(f"Total records in dataset: {len(df)}")

# Display sample records
print("\nSample records from dataset:")
for nct_id in ["NCT12345678", "NCT12345679", "NCT12345680"]:
    sample = df[df["nct_id"] == nct_id]
    if not sample.empty:
        print(f"{nct_id} - Indication: {sample['indication'].values[0]}, Success: {bool(sample['success'].values[0])}")

# Drop rows missing required fields
df = df.dropna(subset=["sample_size", "duration_weeks", "dropout_rate", "success"])
print(f"\nRecords with complete required fields: {len(df)}")

# Define input features and target
X = df[["sample_size", "duration_weeks", "dropout_rate"]]
y = df["success"]

print(f"Success rate in filtered dataset: {y.mean() * 100:.1f}%")

# Fill missing values
X.fillna(X.mean(), inplace=True)

# Train/test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
print(f"Training samples: {len(X_train)}, Test samples: {len(X_test)}")

# Train the model
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Evaluate model
train_accuracy = model.score(X_train, y_train)
test_accuracy = model.score(X_test, y_test)
print(f"Training accuracy: {train_accuracy:.2f}")
print(f"Test accuracy: {test_accuracy:.2f}")

# Make predictions
y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:, 1]

# ROC-AUC
try:
    roc_auc = roc_auc_score(y_test, y_prob)
    print(f"ROC AUC score: {roc_auc:.2f}")
except Exception as e:
    print(f"Could not calculate ROC AUC: {e}")

# Classification report
print("\nClassification Report:")
print(classification_report(y_test, y_pred))

# Feature importance
feature_importance = sorted(zip(X.columns, model.feature_importances_), 
                           key=lambda x: x[1], reverse=True)
print("\nFeature Importance:")
for feature, importance in feature_importance:
    print(f"{feature}: {importance:.4f}")

# Save model
os.makedirs("models", exist_ok=True)
model_path = "models/trial_success_rf.pkl"
with open(model_path, "wb") as f:
    pickle.dump(model, f)

print(f"\nModel saved to {model_path}")

# Show sample predictions
print("\nSample Predictions:")
sample_data = [
    {"sample_size": 300, "duration_weeks": 26, "dropout_rate": 0.17, "desc": "Obesity Phase 2 trial"},
    {"sample_size": 500, "duration_weeks": 52, "dropout_rate": 0.12, "desc": "Large long-term trial"},
    {"sample_size": 150, "duration_weeks": 12, "dropout_rate": 0.28, "desc": "Small short-term trial"}
]

for sample in sample_data:
    sample_X = pd.DataFrame([{k: v for k, v in sample.items() if k != "desc"}])
    prob = model.predict_proba(sample_X)[0, 1]
    pred = model.predict(sample_X)[0]
    print(f"{sample['desc']}: Success probability = {prob:.2f}, Prediction = {'Success' if pred else 'Failure'}")