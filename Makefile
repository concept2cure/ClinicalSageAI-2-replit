# Makefile targets for developer environment
.PHONY: setup-services

setup-services:
	python -m pip install --upgrade pip
	pip install -r services/requirements.txt
