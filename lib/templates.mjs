/**
 * Templates — generate context.md and CLAUDE.md for common stacks.
 */

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { c, ok, fail, warn, info, prompt, mkdirp, mkdirpKeep } from './shared.mjs';
import { findVault } from './projects.mjs';

const STACK_TEMPLATES = {
  'nextjs': {
    name: 'Next.js (App Router)',
    context: `# Project: {{NAME}}

## Overview
Next.js application using App Router (app/ directory).

## Stack
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State:** React Server Components + Client components where needed
- **Database:** <!-- Prisma / Drizzle / Supabase -->
- **Auth:** <!-- NextAuth / Clerk / Supabase Auth -->
- **Deployment:** Vercel

## Architecture
- \`app/\` — routes and layouts (App Router)
- \`components/\` — reusable UI components
- \`lib/\` — utilities, database client, auth config
- \`public/\` — static assets

## Conventions
- Server Components by default, \`"use client"\` only when needed
- API routes in \`app/api/\`
- Colocation: component + test + styles together
- Conventional commits: feat:, fix:, chore:

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'react-vite': {
    name: 'React + Vite SPA',
    context: `# Project: {{NAME}}

## Overview
Single-page React application built with Vite.

## Stack
- **Framework:** React 18+ with Vite
- **Language:** TypeScript
- **Styling:** <!-- Tailwind / CSS Modules / styled-components -->
- **State:** <!-- Zustand / Redux / React Query -->
- **Router:** React Router v6
- **Testing:** Vitest + React Testing Library

## Architecture
- \`src/components/\` — reusable UI components
- \`src/pages/\` — route-level components
- \`src/hooks/\` — custom React hooks
- \`src/lib/\` — utilities, API client
- \`src/store/\` — state management

## Conventions
- Functional components with hooks
- Barrel exports (index.ts) per directory
- Conventional commits

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'fastapi': {
    name: 'FastAPI (Python)',
    context: `# Project: {{NAME}}

## Overview
Python REST API built with FastAPI.

## Stack
- **Framework:** FastAPI
- **Language:** Python 3.11+
- **ORM:** SQLAlchemy 2.0 / SQLModel
- **Database:** PostgreSQL
- **Auth:** <!-- JWT / OAuth2 -->
- **Testing:** pytest + httpx

## Architecture
- \`app/main.py\` — FastAPI app entry
- \`app/routers/\` — API route modules
- \`app/models/\` — SQLAlchemy/Pydantic models
- \`app/services/\` — business logic
- \`app/core/\` — config, security, dependencies
- \`tests/\` — pytest tests

## Conventions
- Type hints everywhere
- Pydantic models for request/response validation
- Dependency injection via FastAPI Depends()
- Alembic for database migrations

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'express': {
    name: 'Express.js / Node.js API',
    context: `# Project: {{NAME}}

## Overview
Node.js REST API built with Express.

## Stack
- **Framework:** Express.js
- **Language:** TypeScript / JavaScript
- **ORM:** <!-- Prisma / TypeORM / Knex -->
- **Database:** <!-- PostgreSQL / MongoDB -->
- **Auth:** <!-- Passport / JWT -->
- **Testing:** Jest + Supertest

## Architecture
- \`src/routes/\` — Express route handlers
- \`src/controllers/\` — request handling logic
- \`src/services/\` — business logic
- \`src/models/\` — database models
- \`src/middleware/\` — auth, validation, error handling

## Conventions
- Async/await error handling
- Middleware-based validation (Zod / Joi)
- Conventional commits

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'rails': {
    name: 'Ruby on Rails',
    context: `# Project: {{NAME}}

## Overview
Ruby on Rails application.

## Stack
- **Framework:** Rails 7+
- **Language:** Ruby
- **Frontend:** <!-- Hotwire / React / ViewComponent -->
- **Database:** PostgreSQL
- **Testing:** RSpec + FactoryBot
- **Background:** Sidekiq

## Architecture
- Standard Rails MVC
- \`app/models/\` — ActiveRecord models
- \`app/controllers/\` — request handling
- \`app/services/\` — POROs for business logic
- \`app/jobs/\` — background jobs

## Conventions
- Fat models, skinny controllers → Service objects
- RSpec for all tests
- Database migrations via \`rails db:migrate\`

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'django': {
    name: 'Django (Python)',
    context: `# Project: {{NAME}}

## Overview
Python web application built with Django.

## Stack
- **Framework:** Django 5+
- **Language:** Python 3.11+
- **API:** Django REST Framework
- **Database:** PostgreSQL
- **Testing:** pytest-django

## Architecture
- Django app-based structure
- \`apps/\` — Django apps (users, api, etc.)
- \`config/\` — settings, URLs, WSGI
- \`templates/\` — HTML templates (if not SPA)

## Conventions
- Class-based views for complex logic
- Django ORM with explicit select_related/prefetch_related
- Migrations via \`python manage.py makemigrations\`

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'flutter': {
    name: 'Flutter (Mobile)',
    context: `# Project: {{NAME}}

## Overview
Cross-platform mobile app built with Flutter.

## Stack
- **Framework:** Flutter 3+
- **Language:** Dart
- **State:** <!-- Riverpod / BLoC / Provider -->
- **Backend:** <!-- Firebase / Supabase / REST API -->
- **Testing:** Flutter test + integration_test

## Architecture
- \`lib/\` — main source
- \`lib/screens/\` — page-level widgets
- \`lib/widgets/\` — reusable components
- \`lib/models/\` — data classes
- \`lib/services/\` — API, auth, storage
- \`lib/providers/\` — state management

## Conventions
- Widgets are small and composable
- Business logic separate from UI
- Platform-specific code in \`android/\` and \`ios/\`

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'go': {
    name: 'Go API / Service',
    context: `# Project: {{NAME}}

## Overview
Go backend service / API.

## Stack
- **Language:** Go 1.22+
- **Router:** <!-- Chi / Gin / stdlib -->
- **Database:** <!-- pgx / GORM / sqlc -->
- **Testing:** Go standard testing + testify

## Architecture
- \`cmd/\` — entry points
- \`internal/\` — private packages
- \`internal/handler/\` — HTTP handlers
- \`internal/service/\` — business logic
- \`internal/repository/\` — data access
- \`pkg/\` — public packages

## Conventions
- Standard Go project layout
- Interfaces for dependency injection
- Table-driven tests
- Error wrapping with fmt.Errorf

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'nuxt': {
    name: 'Nuxt 3 (Vue)',
    context: `# Project: {{NAME}}

## Overview
Nuxt 3 application with Vue 3 Composition API.

## Stack
- **Framework:** Nuxt 3
- **Language:** TypeScript
- **UI:** Vue 3 (Composition API)
- **Styling:** <!-- Tailwind / UnoCSS / PrimeVue -->
- **State:** Pinia
- **Database:** <!-- Prisma / Drizzle / Supabase -->
- **Deployment:** <!-- Vercel / Netlify / Cloudflare Pages -->

## Architecture
- \`pages/\` — file-based routes
- \`components/\` — auto-imported Vue components
- \`composables/\` — auto-imported composables
- \`server/api/\` — Nitro API routes
- \`stores/\` — Pinia stores
- \`layouts/\` — page layouts

## Conventions
- \`<script setup lang="ts">\` for components
- Auto-imports enabled (no manual imports for composables/components)
- Conventional commits
- ESLint + Prettier

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'sveltekit': {
    name: 'SvelteKit',
    context: `# Project: {{NAME}}

## Overview
SvelteKit application with file-based routing.

## Stack
- **Framework:** SvelteKit
- **Language:** TypeScript
- **UI:** Svelte 5 (runes)
- **Styling:** <!-- Tailwind / CSS -->
- **State:** Svelte stores / runes
- **Database:** <!-- Drizzle / Prisma / Supabase -->
- **Adapter:** <!-- Vercel / Netlify / Node / Cloudflare -->

## Architecture
- \`src/routes/\` — file-based routes with +page.svelte, +page.server.ts
- \`src/lib/\` — shared code (auto-imported via \`$lib\`)
- \`src/lib/components/\` — reusable components
- \`src/hooks.server.ts\` — server-side hooks
- \`src/app.html\` — HTML shell

## Conventions
- \`+page.server.ts\` for server-only logic, \`+page.ts\` for universal
- Form actions for mutations (progressive enhancement)
- Conventional commits
- Vitest + Playwright for testing

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'astro': {
    name: 'Astro',
    context: `# Project: {{NAME}}

## Overview
Astro site with island architecture — primarily static with interactive islands.

## Stack
- **Framework:** Astro
- **Language:** TypeScript
- **UI frameworks:** <!-- React / Vue / Svelte islands -->
- **Styling:** <!-- Tailwind / CSS -->
- **Content:** Astro Content Collections (MDX)
- **Deployment:** <!-- Vercel / Netlify / Cloudflare Pages -->

## Architecture
- \`src/pages/\` — file-based routes (.astro, .md, .mdx)
- \`src/components/\` — Astro + framework components
- \`src/content/\` — Content Collections (blog, docs)
- \`src/layouts/\` — page layouts
- \`public/\` — static assets

## Conventions
- Static-first, opt into client-side with \`client:*\` directives
- Content Collections with Zod schemas
- Conventional commits

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'laravel': {
    name: 'Laravel (PHP)',
    context: `# Project: {{NAME}}

## Overview
Laravel application.

## Stack
- **Framework:** Laravel 11+
- **Language:** PHP 8.3+
- **ORM:** Eloquent
- **Database:** <!-- MySQL / PostgreSQL -->
- **Frontend:** <!-- Blade / Livewire / Inertia+Vue/React -->
- **Queue:** <!-- Redis / database -->
- **Testing:** Pest / PHPUnit

## Architecture
- \`app/Models/\` — Eloquent models
- \`app/Http/Controllers/\` — request handling
- \`app/Http/Requests/\` — form request validation
- \`app/Services/\` — business logic
- \`app/Jobs/\` — queued jobs
- \`routes/\` — web.php, api.php
- \`database/migrations/\` — schema migrations

## Conventions
- Skinny controllers, fat services
- Form Requests for validation
- Eloquent relationships with eager loading
- Artisan commands for CLI tasks
- Laravel Pint for code style

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'spring-boot': {
    name: 'Spring Boot (Java/Kotlin)',
    context: `# Project: {{NAME}}

## Overview
Spring Boot application / REST API.

## Stack
- **Framework:** Spring Boot 3+
- **Language:** <!-- Java 21 / Kotlin -->
- **Build:** <!-- Maven / Gradle -->
- **Database:** <!-- PostgreSQL / MySQL -->
- **ORM:** Spring Data JPA / Hibernate
- **Security:** Spring Security
- **Testing:** JUnit 5 + Testcontainers

## Architecture
- \`src/main/java/com/example/\`
  - \`controller/\` — REST controllers
  - \`service/\` — business logic
  - \`repository/\` — Spring Data repositories
  - \`entity/\` — JPA entities
  - \`dto/\` — data transfer objects
  - \`config/\` — Spring configuration
- \`src/main/resources/\` — application.yml, migrations

## Conventions
- Constructor injection (not @Autowired on fields)
- DTOs for API contracts, entities for persistence
- Flyway / Liquibase for migrations
- Integration tests with Testcontainers

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
  'blank': {
    name: 'Blank (custom)',
    context: `# Project: {{NAME}}

## Overview
<!-- What does this project do? -->

## Stack
<!-- Languages, frameworks, databases, key libraries -->

## Architecture
<!-- Directory structure and key patterns -->

## Conventions
<!-- Coding style, commit messages, testing approach -->

## Current State
<!-- What's built, what's in progress, what's next -->
`,
  },
};

export async function generateTemplate() {
  console.log('');
  console.log(`  ${c.bold}Generate from template${c.reset}`);
  console.log('');

  // Choose stack
  const { stack } = await prompt({
    type: 'select',
    name: 'stack',
    message: 'Choose a stack template',
    choices: Object.entries(STACK_TEMPLATES).map(([key, val]) => ({
      title: val.name,
      value: key,
    })),
  });

  if (!stack) return;

  // Ask for project name
  const { projectName } = await prompt({
    type: 'text',
    name: 'projectName',
    message: 'Project name',
  });

  if (!projectName) return;

  const clean = projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const template = STACK_TEMPLATES[stack];
  const content = template.context.replace(/\{\{NAME\}\}/g, clean);

  // Where to save?
  const { target } = await prompt({
    type: 'select',
    name: 'target',
    message: 'Where to save context.md?',
    choices: [
      { title: 'Vault (recommended)', value: 'vault' },
      { title: 'Current directory', value: 'cwd' },
      { title: 'Print to console', value: 'print' },
    ],
  });

  if (target === 'vault') {
    let vaultPath = findVault();
    if (!vaultPath) {
      warn('Vault not found. Saving to current directory instead.');
      writeFileSync('context.md', content);
      ok('context.md created in current directory');
    } else {
      const projDir = join(vaultPath, 'projects', clean);
      mkdirpKeep(join(projDir, 'decisions'));
      mkdirpKeep(join(projDir, 'sessions'));
      mkdirpKeep(join(projDir, 'docs'));
      const contextPath = join(projDir, 'context.md');

      if (existsSync(contextPath)) {
        const { overwrite } = await prompt({
          type: 'confirm',
          name: 'overwrite',
          message: 'context.md already exists. Overwrite?',
          initial: false,
        });
        if (!overwrite) {
          info('Kept existing context.md');
          console.log('');
          return;
        }
      }

      writeFileSync(contextPath, content);
      ok(`${contextPath.replace(homedir(), '~')}`);
    }
  } else if (target === 'cwd') {
    writeFileSync('context.md', content);
    ok('context.md created in current directory');
  } else {
    console.log('');
    console.log(content);
  }

  console.log('');
  info('Edit the context.md to fill in project-specific details.');
  console.log('');
}

export async function main(args = []) {
  await generateTemplate();
}
