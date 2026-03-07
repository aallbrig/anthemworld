---
title: "Welcome to Anthem World"
---

<div class="text-center mb-5">
  <h1 class="display-3">🌍 Anthem World 🎵</h1>
  <p class="lead">Discover, explore, and rank the national anthems of all 193 UN-recognized countries.</p>
</div>

<!-- Feature cards -->
<div class="row g-4 mb-5">

  <div class="col-md-6 col-lg-3">
    <div class="card h-100 text-center shadow-sm">
      <div class="card-body">
        <div class="display-5 mb-2">🗺️</div>
        <h5 class="card-title">Interactive Map</h5>
        <p class="card-text text-muted small">Click any country to view its anthem and listen to the music that represents each nation.</p>
        <a href="/map/" class="btn btn-outline-primary btn-sm">Explore the Map</a>
      </div>
    </div>
  </div>

  <div class="col-md-6 col-lg-3">
    <div class="card h-100 text-center shadow-sm">
      <div class="card-body">
        <div class="display-5 mb-2">🎵</div>
        <h5 class="card-title">Anthem Battle</h5>
        <p class="card-text text-muted small">Listen to two national anthems and vote for your favourite. ELO rankings update in real time.</p>
        <a href="/game/" class="btn btn-primary btn-sm">Play Now</a>
      </div>
    </div>
  </div>

  <div class="col-md-6 col-lg-3">
    <div class="card h-100 text-center shadow-sm">
      <div class="card-body">
        <div class="display-5 mb-2">🏆</div>
        <h5 class="card-title">Leaderboard</h5>
        <p class="card-text text-muted small">See which national anthems the community rates highest, sorted by ELO score.</p>
        <a href="/leaderboard/" class="btn btn-outline-primary btn-sm">View Rankings</a>
      </div>
    </div>
  </div>

  <div class="col-md-6 col-lg-3">
    <div class="card h-100 text-center shadow-sm">
      <div class="card-body">
        <div class="display-5 mb-2">📊</div>
        <h5 class="card-title">Countries Table</h5>
        <p class="card-text text-muted small">Browse and search all countries, composers, adoption dates, and anthem history.</p>
        <a href="/countries/" class="btn btn-outline-primary btn-sm">Browse Countries</a>
      </div>
    </div>
  </div>

</div>

<!-- Live top 3 + about side by side -->
<div class="row g-4 mb-5">

  <div class="col-md-5">
    <h2>🏅 Current Top 3</h2>
    <div id="home-top3">
      <div class="text-muted small">Loading rankings…</div>
    </div>
    <a href="/leaderboard/" class="btn btn-sm btn-outline-secondary mt-2">Full leaderboard →</a>
  </div>

  <div class="col-md-7">
    <h2>About Anthem World</h2>
    <p>National anthems are powerful symbols of national identity and pride. Each anthem tells a unique story about a country's history, values, and aspirations. Anthem World brings together all 193 UN-recognized countries' national anthems in one interactive experience.</p>
    <p>The <strong>Anthem Battle</strong> game uses the <a href="https://en.wikipedia.org/wiki/Elo_rating_system" target="_blank" rel="noopener">ELO rating system</a> — the same method used in chess and competitive gaming — to rank anthems based on head-to-head community votes. Each match requires listening to both anthems before voting.</p>

    <h5 class="mt-3">Data Sources</h5>
    <ul class="mb-0">
      <li><a href="https://restcountries.com/" target="_blank" rel="noopener">REST Countries</a> — country metadata and flags</li>
      <li><a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a> — anthem names, composers, adoption dates</li>
      <li><a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a> — audio recordings (CC-BY-SA)</li>
      <li><a href="https://www.cia.gov/the-world-factbook/" target="_blank" rel="noopener">CIA World Factbook</a> — historical context</li>
    </ul>
  </div>

</div>
