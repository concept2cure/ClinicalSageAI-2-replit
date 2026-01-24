#!/bin/bash
# Essential dependencies reinstall script
# Run this if dependencies are missing after restart

echo "Installing essential dependencies..."

npm install --no-audit \
  mammoth \
  docx \
  socket.io \
  socket.io-client \
  marked \
  @tiptap/react \
  @tiptap/starter-kit \
  @tiptap/extension-placeholder \
  @tiptap/extension-table \
  @tiptap/extension-highlight \
  @tiptap/extension-task-list \
  @tiptap/extension-task-item \
  @tiptap/extension-character-count \
  @tiptap/core \
  file-saver \
  jspdf-autotable \
  react-dnd \
  react-dnd-html5-backend \
  xlsx \
  d3 \
  express-rate-limit \
  jsonwebtoken \
  jszip \
  bcrypt \
  uuid \
  cheerio

echo "Dependencies installed successfully!"