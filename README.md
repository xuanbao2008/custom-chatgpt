
# Custom ChatGPT with Embedding

## Setup

1. Copy `.env.example` to `.env` and add your OpenAI API key
2. Run with Docker:

```
docker-compose up --build
```

3. Visit http://localhost:3000

- Upload files via `/upload`
- Ask questions via `/chat`
- Ask something related to uploaded docs, e.g, food or satellite related questions

4. To-do:
- Force chatbot to answer regardless language used in questions, sometimes it only responses to language used in provided docs
