type Err = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

export function getErrMessage(error: unknown, message: string) {
  const err = error as Err;

  return err?.response?.data?.message || message;
}
