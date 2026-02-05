# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

````markdown
# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

````

## Using Yarn 4 (Berry)

This project was originally created with Yarn Classic (1.x). To use Yarn 4 while keeping a `node_modules` layout, follow these steps locally:

1. Enable Corepack (bundled with recent Node versions) and activate Yarn:

```bash
corepack enable
corepack prepare yarn@stable --activate
```

2. (Optional) Pin a Yarn release into the repo (this will create `.yarn/releases`):

```bash
yarn set version stable
```

3. Install dependencies using Yarn 4:

```bash
yarn install
```

Notes:
- This repository includes a minimal `.yarnrc.yml` configured to use the `node-modules` linker so installs behave like Yarn 1.
- If you want Plug'n'Play instead, remove or change `nodeLinker` in `.yarnrc.yml`.
