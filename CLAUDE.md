# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. This repository creates a high performant js grid.

## Project Structure

This is a yarn workspace with following packages:

- **packages/utils**: Ignore for now
- **packages/datamodel**: Ignore for now
- **packages/playground**: React web application that creates playground where samples of grid can get created during development / demo
- **packages/grid**: High peformant Grid / pivot table implementation

### Technology Stack
- **utils**: TypeScript, ESLint
- **datamodel**: TypeScript, ESLint
- **grid**: TypeScript, ESLint
- **playground**: React 18, TypeScript, Webpack 5, ESLint

### Development Server
Already setup by the user and running. 

## Grid

- Grid supports a ViewModel architecture with with explicit control via controller. ./packages/grid/src/index.ts is the controller and also the entry point. 
- It has a open closed architecture where even the core grid is rendered by registering various components. You can look at ./packages/grid/src/index.ts Grid.register call
- So far the controller expect components to comply to following protocol found in ./packages/grid/src/core/*-proto.ts files
- ./packages/playground/src/grid.tsx uses the grid library to render the grid

## Notes

- Do NOT make formatting changes (like adding/removing spaces, adding/removing newlines, etc) to existing code.
- Do NOT write comments unless explicity asked to do so. But do NOT remove any existing comments.
- Do NOT address TODO in code comments unless explicity asked to do so.
- Run lint `yarn workspace grid lint --fix 2>&1` to fix autofixable lints and report the rest which you can try fixing manually
- Do NOT run playground build
- All packages use TypeScript with strict mode enabled
- The workspace uses yarn workspaces for dependency management
- ESLint is configured but may need workspace-level configuration fixes
