#!/bin/bash

echo "Installing critical missing dependencies..."
npm install bcrypt cheerio jsonwebtoken --save
echo "✅ Critical dependencies installed!"
echo "You can now run: npm run dev"