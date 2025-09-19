# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a yarn workspace with three packages:

- **packages/utils**: Pure JavaScript library with utility functions (TypeScript compiled to CommonJS)
- **packages/datamodel**: Business logic library that depends on utils (TypeScript compiled to CommonJS)
- **packages/grid**: React web application that depends on datamodel (TypeScript + Webpack + React)

## Common Commands

### Development
- `yarn start` - Start the grid React development server (runs on http://localhost:3000)
- `yarn build` - Build all packages in the workspace
- `yarn clean` - Clean all build outputs

### Individual Package Commands
- `yarn workspace utils build` - Build utils package
- `yarn workspace datamodel build` - Build datamodel package
- `yarn workspace grid build` - Build grid package for production
- `yarn workspace grid start` - Start grid development server

### Build Order
Packages must be built in dependency order:
1. utils (no dependencies)
2. datamodel (depends on utils)
3. grid (depends on datamodel)

## Architecture

### Package Dependencies
```
grid (React app)
  └── datamodel (business logic)
      └── utils (utility functions)
```

### Key Files
- `packages/utils/src/index.ts` - Utility functions (add, multiply, subtract)
- `packages/datamodel/src/index.ts` - Business logic that uses utils functions
- `packages/grid/src/App.tsx` - Main React component
- `packages/grid/src/index.tsx` - React app entry point

### Technology Stack
- **utils**: TypeScript, ESLint
- **datamodel**: TypeScript, ESLint
- **grid**: React 18, TypeScript, Webpack 5, ESLint

### Development Server
The grid package runs a webpack-dev-server on port 3000 with hot reloading enabled.

## Notes

- All packages use TypeScript with strict mode enabled
- The workspace uses yarn workspaces for dependency management
- ESLint is configured but may need workspace-level configuration fixes
- Grid package outputs to `dist/` directory with webpack
- Utils and datamodel compile to `dist/` with TypeScript compiler