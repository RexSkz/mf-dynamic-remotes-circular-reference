export async function sub() {
  const { answer } = await import('main_app');
  console.trace('sub-app-sync', answer());
}
