#!/usr/bin/env node
import { VERSION, PACKAGE_NAME } from '@lopr/core';

const help = `lopr ${VERSION} — review AI agent code like a GitHub PR, entirely locally

Usage: lopr <command>

Commands are not implemented yet. The scaffold is in place; the first
command set (new, comment, approve, request-changes, resolve, status,
merge, export, skill) ships with the CLI epic.

Package: ${PACKAGE_NAME}
`;

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write(help);
  process.exitCode = 0;
} else {
  process.stderr.write(`lopr: unknown command '${args[0]}'\n\n`);
  process.stderr.write(help);
  process.exitCode = 1;
}
