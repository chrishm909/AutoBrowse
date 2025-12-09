#!/bin/bash

echo "Starting AutoBrowse Testbed Server..."
echo ""

cd testbed

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

echo "Starting server..."
npm start
