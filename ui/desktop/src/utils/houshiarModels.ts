export async function fetchHoushiarModels(apiKey: string): Promise<string[]> {
  return window.electron.fetchHoushiarModels(apiKey);
}
