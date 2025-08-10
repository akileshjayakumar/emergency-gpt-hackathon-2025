## Hawker Food Menu Helper (Emergency GPT Hackathon 2025)

Built during the EMERGENCY GPT HACKATHON 2025 in Singapore. Event details: [EMERGENCY GPT HACKATHON on Luma](https://lu.ma/dn2iqbwu?tk=kM5Qjp).

### What this app does

- Upload a hawker stall menu photo (PNG/JPEG)
- Extract dish names and prices with a vision model
- Analyse the menu to find cheapest, most expensive, healthiest, and most filling options
- Chat with a Singapore hawker food assistant for tips and healthier swaps

### Tech stack

- Next.js 15, React 19, TypeScript
- Tailwind CSS v4 for styling
- AI SDK + Groq for LLM/VLM

### Quick start

1. Prerequisites

   - Node.js 18+ (recommend 20+)
   - npm (or pnpm/yarn)

2. Install

```bash
npm install
```

3. Environment variables
   Create `.env.local` in the project root with:

```bash
GROQ_API_KEY=your_groq_api_key
# Optional: override default Groq vision model used in /api/extract
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

4. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000 and try uploading a menu image.

### Scripts

- `npm run dev` start Next.js dev server (with Turbopack)
- `npm run build` production build
- `npm run start` start production server
- `npm run lint` run Next.js ESLint

### API reference

All endpoints are under `/api/*`.

1. POST `/api/extract`

- Content-Type: `multipart/form-data` with an `image` field (PNG/JPEG)
- Size limit: ~4 MB image enforced
- Response:

```json
{
  "items": [{ "name": "chicken rice", "price": 3.5 }]
}
```

- Example (curl):

```bash
curl -X POST http://localhost:3000/api/extract \
  -F "image=@/path/to/menu.jpg"
```

2. POST `/api/analyse`

- Content-Type: `application/json`
- Body:

```json
{
  "items": [
    { "name": "chicken rice", "price": 3.5 },
    { "name": "fish soup", "price": 5.0 }
  ]
}
```

- Response includes cheapest, most_expensive, healthiest, most_filling, and follow_up_questions.

3. POST `/api/chat`

- Content-Type: `application/json`
- Body (minimal):

```json
{
  "messages": [{ "role": "user", "content": "What is a healthy pick?" }]
}
```

- Streams a plain text response from the assistant. You can optionally include a `context.items` array with extracted menu items to ground the chat.

### Acknowledgements

- Built at the [EMERGENCY GPT HACKATHON 2025](https://lu.ma/dn2iqbwu?tk=kM5Qjp)
- Thanks to OpenAI (credits), Groq, and the organizers.

### License

For hackathon and educational use. Adapt as needed.
