export async function retryOnce<T>(
  run: () => Promise<T>,
  options?: { baseDelayMs?: number }
): Promise<T> {
  const baseDelayMs = options?.baseDelayMs ?? 250;
  try {
    return await run();
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs));
    return run().catch((secondError) => {
      throw secondError || firstError;
    });
  }
}

