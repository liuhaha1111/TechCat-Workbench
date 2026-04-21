type FileInputValueHolder = {
  value: string;
};

export function clearBrowserFileInputValue(
  input: FileInputValueHolder | null | undefined
): void {
  if (!input) {
    return;
  }

  input.value = "";
}
