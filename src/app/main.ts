import { Game } from './game';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const boot = document.getElementById('boot')!;
  try {
    const game = new Game(document.getElementById('game') as HTMLCanvasElement, document.getElementById('ui')!);
    await game.init(params.get('renderer'));
    if (params.has('dev')) (await import('./dev')).installDev(game);
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 450);
  } catch (err) {
    console.error(err);
    boot.innerHTML = `RIFTBREAK<span>failed to start: ${String((err as Error)?.message ?? err)}</span>`;
  }
}
void boot();
