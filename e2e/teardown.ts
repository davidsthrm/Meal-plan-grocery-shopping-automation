import { clearTestHousehold } from "./fixtures";

/**
 * After a test run nothing of it stays behind: the made-up recipes the tests plan and search
 * with are taken out of the test household again. Every test puts in what it needs.
 */
export default async function teardown(): Promise<void> {
  await clearTestHousehold();
}
