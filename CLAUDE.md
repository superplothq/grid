# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a yarn workspace with three packages:

- **packages/utils**: Pure JavaScript library with utility functions (TypeScript compiled to CommonJS)
- **packages/datamodel**: Business logic library that depends on utils (TypeScript compiled to CommonJS)
- **packages/playground**: React web application that depends on datamodel (TypeScript + Webpack + React)
- **packages/grid**: Grid / pivot table web component

### Technology Stack
- **utils**: TypeScript, ESLint
- **datamodel**: TypeScript, ESLint
- **grid**: TypeScript, ESLint
- **playground**: React 18, TypeScript, Webpack 5, ESLint

### Development Server
The playground package runs a webpack-dev-server on port 3000 with hot reloading enabled.

## Notes

- If you get lint errors, first run autofix to fix all autofixable errors, then run eslint again to see remaining errors
  and fix them manually.
- All packages use TypeScript with strict mode enabled
- The workspace uses yarn workspaces for dependency management
- ESLint is configured but may need workspace-level configuration fixes
- Playground package outputs to `dist/` directory with webpack
- Utils and datamodel compile to `dist/` with TypeScript compiler
