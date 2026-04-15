#!/usr/bin/env node
'use strict'

const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

function findBun() {
  // Prefer system bun — already installed and correct version
  const which = spawnSync('which', ['bun'], { encoding: 'utf8' })
  if (which.status === 0 && which.stdout.trim()) return 'bun'

  // Fall back to the bun binary installed alongside this package
  try {
    const bunPkgDir = path.dirname(require.resolve('bun/package.json'))
    const candidate = path.resolve(bunPkgDir, '..', '.bin', 'bun')
    if (fs.existsSync(candidate)) return candidate
  } catch {}

  console.error('Error: bun is required to run @inspatch/server.')
  console.error('Install it from https://bun.sh and try again.')
  process.exit(1)
}

const bun = findBun()
const entry = path.resolve(__dirname, '..', 'src', 'index.ts')
const result = spawnSync(bun, [entry, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
