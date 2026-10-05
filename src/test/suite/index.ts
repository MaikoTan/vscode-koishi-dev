import * as path from 'path'
import * as Mocha from 'mocha'
import { globSync } from 'glob'

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
  })

  const testsRoot = path.resolve(__dirname, '..')

  // Add files to the test suite, sorted so run order does not depend on the
  // order the filesystem happens to report.
  globSync('**/**.test.js', { cwd: testsRoot })
    .sort()
    .forEach((f) => mocha.addFile(path.resolve(testsRoot, f)))

  // Run the mocha test
  const failures = await new Promise<number>((c, e) => {
    try {
      mocha.run(c)
    } catch (err) {
      console.error(err)
      e(err)
    }
  })

  if (failures > 0) {
    throw new Error(`${failures} tests failed.`)
  }
}
