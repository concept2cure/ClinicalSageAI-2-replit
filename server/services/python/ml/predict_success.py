
# Move content from models/predict_success.py
import pickle
import pandas as pd
import numpy as np

class SuccessPredictor:
    def __init__(self, model_path="server/services/python/models/trial_success_model.pkl"):
        self.model_path = model_path
        self.model = None
        self.load_model()
    
    def load_model(self):
        """Load the trained model"""
        try:
            with open(self.model_path, 'rb') as f:
                self.model = pickle.load(f)
        except FileNotFoundError:
            print(f"Model file not found: {self.model_path}")
    
    def predict(self, features):
        """Make prediction"""
        if self.model is None:
            return None
        return self.model.predict(features)
    
    def predict_proba(self, features):
        """Get prediction probabilities"""
        if self.model is None:
            return None
        return self.model.predict_proba(features)
