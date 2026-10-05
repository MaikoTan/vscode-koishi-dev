import * as path from 'path'
import * as Mocha from 'mocha'
import { glob } from 'glob'

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
  })

  const testsRoot = path.resolve(__dirname, '..')

  const files = await glob('**/**.test.js', { cwd: testsRoot })
  for (const file of files.sort()) {
    mocha.addFile(path.resolve(testsRoot, file))
  }

  const failures = await new Promise<number>((resolve, reject) => {
    try {
      mocha.run(resolve)
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })

  if (failures > 0) {throw new Error(`${failures} tests failed.`)}
}
