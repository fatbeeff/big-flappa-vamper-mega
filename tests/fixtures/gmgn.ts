export const trenchesFixture = `<!doctype html>
<html lang="en">
  <body data-chain="bsc" data-surface="trenches">
    <main data-testid="trenches-list">
      <article data-testid="trenches-card" data-token-address="0x111">
        <h2>Bat Coin</h2>
        <div data-testid="card-hover-actions" style="display:flex">
          <button type="button">Buy</button>
          <button type="button">Buy</button>
        </div>
      </article>
    </main>
    <script>
      const actions = document.querySelector('[data-testid="card-hover-actions"]');
      document.body.dataset.initialActionsWidth = String(actions.getBoundingClientRect().width);
      document.body.dataset.initialActionsHeight = String(actions.getBoundingClientRect().height);
    </script>
  </body>
</html>`;

export const chartFixture = `<!doctype html>
<html lang="en">
  <body data-chain="bsc" data-surface="chart">
    <main>
      <h1>Bat Coin</h1>
      <aside data-testid="chart-action-rail">
        <button type="button" aria-label="Favorite">★</button>
      </aside>
    </main>
  </body>
</html>`;

export const nonBscFixture = trenchesFixture.replace('data-chain="bsc"', 'data-chain="sol"');
