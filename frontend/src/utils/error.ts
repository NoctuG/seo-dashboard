import axios from 'axios';

interface ErrorResponseData {
  detail?: unknown;
}

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (axios.isAxiosError<ErrorResponseData>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}
