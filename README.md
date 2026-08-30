# FocusFlow - Full Stack Task Manager

A focused, responsive task management application built for the Finlec Technologies screening assignment. It supports private user accounts and a clear workflow from pending work through completion.

## Features

- Sign up and log in with bcrypt password hashing and 7-day JWT sessions.
- Create, read, edit, delete, search, and filter tasks.
- Change a task between **Pending**, **In progress**, and **Done** directly from the dashboard.
- Optional notes and due dates, plus useful task counts and an empty state.
- Responsive web experience for desktop and mobile browsers.
- SQLite persistence and user-scoped API authorization.

## Tech stack

- **Frontend:** React 18, Vite, CSS (responsive, no component-library dependency)
- **Backend:** Node.js, Express, JWT, bcryptjs
- **Database:** SQLite (using Node.js's built-in SQLite driver - no native addon setup)

This stack keeps the exercise approachable while separating the UI and REST API cleanly. SQLite makes local review effortless; its schema can later move to PostgreSQL without changing the API contract.

## Run locally

Prerequisite: Node.js 20+.

```bash
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API starts at `http://localhost:4000`; `server/tasks.db` is created automatically. For production, copy `server/.env.example` to `server/.env` and provide a unique long `JWT_SECRET`.

To create a production client build:

```bash
npm run build --prefix client
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Log in |
| GET / POST | `/api/tasks` | List / create the current user's tasks |
| PUT / DELETE | `/api/tasks/:id` | Update / remove a task |
| PATCH | `/api/tasks/:id/status` | Change task status |

All task routes require `Authorization: Bearer <token>`.

## Security and engineering decisions

- Passwords are never stored in plain text; they use bcrypt with 12 salt rounds.
- JWT-protected task endpoints always query by both task ID and authenticated user ID.
- Server-side validation limits title/name sizes, validates statuses and dates, and returns useful client errors.
- The API accepts small JSON bodies only and exposes CORS solely to the local Vite client during development.

## Product thinking and next steps

The UI prioritizes a calm single-task-list experience: status color is reinforced with clear labels, and adding/updating work stays in one lightweight modal. The Finlec Technologies site emphasizes responsive product delivery, UI/UX, and AI/data services; this implementation reflects that with a clean API boundary and scalable direction.

With more time, I would add:

1. Task priority, tags, reminders, and recurring tasks.
2. PostgreSQL + migrations, rate limiting, refresh-token rotation, and HTTP-only cookies for production.
3. Team workspaces, assignment, activity history, and real-time updates.
4. Calendar/kanban views, accessible keyboard shortcuts, and optimistic/offline updates.
5. Tests (API integration and UI flows), CI/CD, and deployment to Vercel + Render/Railway.

## Challenges

The main trade-off was retaining a high-quality, responsive interface without introducing a heavy UI framework. A small tokenized CSS system and straightforward React state keep the project easy to inspect and extend, while the REST API retains secure ownership boundaries from the outset.
