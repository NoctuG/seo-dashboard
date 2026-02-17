type SetState<T> = (value: T) => void;

interface RunWithUiStateOptions<E> {
  setLoading?: SetState<boolean>;
  setError?: SetState<E>;
  clearErrorValue?: E;
  formatError?: (error: unknown) => E;
  onError?: (error: unknown, formattedError: E | null) => void;
}

export async function runWithUiState<T, E = string>(
  action: () => Promise<T>,
  options: RunWithUiStateOptions<E> = {},
): Promise<T | undefined> {
  const { setLoading, setError, clearErrorValue, formatError, onError } = options;

  setLoading?.(true);
  if (setError && clearErrorValue !== undefined) {
    setError(clearErrorValue);
  }

  try {
    return await action();
  } catch (error: unknown) {
    const formattedError = formatError ? formatError(error) : null;
    if (setError && formattedError !== null) {
      setError(formattedError);
    }
    onError?.(error, formattedError);
    return undefined;
  } finally {
    setLoading?.(false);
  }
}
