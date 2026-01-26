# Agent Rules

## 1. Testing & Dependency Resolution
- Ensure all dependencies are defined in `requirements.txt` or equivalent.
- Run automated tests after each code change to verify functionality.
- Use version constraints in dependency declarations to avoid breaking changes.

## 2. Work Preservation & Anti-Destruction Rules
- Code changes should be committed in small, atomic chunks.
- Before performing major modifications, create a new branch from `main`.
- Regularly back up work to avoid loss due to accidental deletions or overwrites.

## 3. Concept2Cure GitHub Codespaces & Compliance Rules
- All code should comply with the organization’s coding standards and best practices.
- Use GitHub Codespaces for development to ensure a consistent development environment.
- Adhere to license agreements when using third-party libraries or resources.