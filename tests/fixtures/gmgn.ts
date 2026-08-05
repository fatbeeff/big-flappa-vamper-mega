export const trenchesFixture = `<!doctype html>
<html lang="en">
  <body data-chain="bsc" data-surface="trenches">
    <main data-testid="trenches-list">
      <article data-testid="trenches-card" data-token-address="0x111" style="position:relative;width:320px;height:120px">
        <h2>Bat Coin</h2>
        <div data-testid="token-image">🦇</div>
        <div data-testid="card-left-hover-rail" style="position:absolute;left:4px;top:32px;display:flex;flex-direction:column">
          <button type="button" class="gmgn-card-rail-action" aria-label="Pin token" style="width:28px;height:28px">⌖</button>
        </div>
        <div data-testid="card-hover-actions" style="display:flex;margin-left:80px">
          <button type="button" data-native-buy="first" onclick="window.buyInvocations.push('first')">Buy</button>
          <button type="button" data-native-buy="second" onclick="window.buyInvocations.push('second')">Buy</button>
        </div>
      </article>
    </main>
    <script>
      window.buyInvocations = [];
      const card = document.querySelector('[data-testid="trenches-card"]');
      document.body.dataset.initialCardWidth = String(card.getBoundingClientRect().width);
      document.body.dataset.initialCardHeight = String(card.getBoundingClientRect().height);
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

export const statefulChartFixture = `<!doctype html>
<html lang="en">
  <body data-chain="bsc" data-surface="chart">
    <main>
      <h1>Bat Coin</h1>
      <aside data-testid="chart-action-rail">
        <button
          id="favorite-action"
          class="gmgn-chart-action"
          style="width:36px;height:36px"
          type="button"
          aria-label="Favorite"
          aria-pressed="true"
          data-gmgn-action="favorite"
          disabled
          onclick="window.favoriteInvocations += 1"
        >★</button>
      </aside>
    </main>
    <script>window.favoriteInvocations = 0;</script>
  </body>
</html>`;

export const nonBscFixture = trenchesFixture.replace('data-chain="bsc"', 'data-chain="sol"');

export const hiddenTrenchesFixture = `<!doctype html>
<html lang="en">
  <head>
    <style>
      [data-testid="card-left-hover-rail"] { display: none; }
      [data-testid="trenches-card"]:hover [data-testid="card-left-hover-rail"] { display: flex; }
    </style>
  </head>
  <body data-chain="bsc" data-surface="trenches">
    <main data-testid="trenches-list">
      <article data-testid="trenches-card" data-token-address="0x111" style="position:relative;width:320px;height:120px">
        <h2>Bat Coin</h2>
        <div data-testid="token-image">🦇</div>
        <div data-testid="card-left-hover-rail" style="position:absolute;left:4px;top:32px;flex-direction:column">
          <button type="button" class="gmgn-card-rail-action" aria-label="Pin token" style="width:28px;height:28px">⌖</button>
        </div>
        <div data-testid="card-hover-actions" style="display:flex;margin-left:80px">
          <button type="button">Buy</button>
          <button type="button">Buy</button>
        </div>
      </article>
    </main>
    <script>
      const card = document.querySelector('[data-testid="trenches-card"]');
      document.body.dataset.initialCardWidth = String(card.getBoundingClientRect().width);
      document.body.dataset.initialCardHeight = String(card.getBoundingClientRect().height);
    </script>
  </body>
</html>`;
