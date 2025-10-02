document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENT REFERENCES ---
    const dashboardView = document.getElementById('dashboard-view');
    const detailView = document.getElementById('detail-view');
    const marketOverviewEl = document.getElementById('market-overview');
    const tableBodyEl = document.getElementById('crypto-table-body');
    const loadingSpinner = document.getElementById('loading-spinner');
    const loadingSpinnerDetail = document.getElementById('loading-spinner-detail');
    const detailContent = document.getElementById('detail-content');
    const backButton = document.getElementById('back-button');
    const timeSelector = document.getElementById('time-selector');

    // --- API URLS ---
    const API_COINS_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h';
    const API_GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';

    // --- GLOBAL VARIABLES ---
    let priceChart;
    let detailChart;
    let updateInterval;
    let currentCoinId = null;

    // --- HELPER FUNCTIONS ---
    const formatNumber = (num) => {
        if (num >= 1e12) return (num / 1e12).toFixed(2) + ' T';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + ' B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + ' M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + ' K';
        return num?.toFixed(2) || '0';
    };

    const createSparkline = (data) => {
        const width = 120, height = 40;
        const max = Math.max(...data), min = Math.min(...data);
        const range = max - min || 1;
        const points = data.map((value, index) => {
            const x = (index / (data.length - 1)) * width;
            const y = height - ((value - min) / range) * height;
            return `${x},${y}`;
        }).join(' ');
        const color = data[0] < data[data.length - 1] ? '#10b981' : '#ef4444';
        return `<svg class="sparkline" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="${color}" stroke-width="2" points="${points}"/></svg>`;
    };

    const formatChartLabel = (timestamp, days) => {
        const date = new Date(timestamp);
        if (days === 1) {
            return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    };

    // --- VIEW MANAGEMENT ---
    const showView = (view) => {
        if (view === 'dashboard') {
            dashboardView.classList.remove('hidden');
            detailView.classList.add('hidden');
        } else {
            dashboardView.classList.add('hidden');
            detailView.classList.remove('hidden');
        }
    };

    // --- DASHBOARD LOGIC ---
    const renderMarketOverview = (data) => {
        const { total_market_cap, total_volume, market_cap_percentage } = data.data;
        marketOverviewEl.innerHTML = `
            <div class="stat-card"><h3>Kapitalisasi Pasar Total</h3><p>$${formatNumber(total_market_cap.usd)}</p></div>
            <div class="stat-card"><h3>Volume Perdagangan 24j</h3><p>$${formatNumber(total_volume.usd)}</p></div>
            <div class="stat-card"><h3>Dominasi BTC</h3><p>${market_cap_percentage.btc.toFixed(2)}%</p></div>
            <div class="stat-card"><h3>Dominasi ETH</h3><p>${market_cap_percentage.eth.toFixed(2)}%</p></div>
        `;
    };

    const renderTable = (coins) => {
        tableBodyEl.innerHTML = '';
        coins.forEach(coin => {
            const priceChangeClass = coin.price_change_percentage_24h >= 0 ? 'text-success' : 'text-danger';
            const priceChangeSymbol = coin.price_change_percentage_24h >= 0 ? '+' : '';
            const sparklineSvg = createSparkline(coin.sparkline_in_7d.price);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${coin.market_cap_rank}</td>
                <td><div class="crypto-info"><img src="${coin.image}" alt="${coin.name}"><span>${coin.name}</span><span class="symbol">${coin.symbol.toUpperCase()}</span></div></td>
                <td>$${coin.current_price.toLocaleString()}</td>
                <td class="${priceChangeClass}">${priceChangeSymbol}${coin.price_change_percentage_24h.toFixed(2)}%</td>
                <td>$${formatNumber(coin.market_cap)}</td>
                <td>${sparklineSvg}</td>
            `;
            row.addEventListener('click', () => showCoinDetail(coin.id));
            tableBodyEl.appendChild(row);
        });
    };
    
    const updateDashboardChart = (coins) => {
        const topCoins = coins.slice(0, 10);
        const currentTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        if (!priceChart) {
            const ctx = document.getElementById('priceChart').getContext('2d');
            priceChart = new Chart(ctx, {
                type: 'line', data: {
                    labels: [currentTime],
                    datasets: topCoins.map(coin => ({
                        label: coin.name, data: [coin.current_price],
                        borderColor: `hsl(${Math.random() * 360}, 70%, 60%)`, backgroundColor: 'transparent',
                        tension: 0.1, borderWidth: 2, pointRadius: 0,
                    }))
                }, options: {
                    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false, },
                    scales: {
                        y: { beginAtZero: false, ticks: { color: '#a0a0b8', callback: value => '$' + formatNumber(value) }, grid: { color: '#2a2a4e', drawBorder: false } },
                        x: { ticks: { color: '#a0a0b8' }, grid: { display: false } }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { color: '#ffffff', usePointStyle: true } },
                        tooltip: { backgroundColor: '#191933', titleColor: '#ffffff', bodyColor: '#a0a0b8', borderColor: '#2a2a4e', borderWidth: 1 }
                    }
                }
            });
        } else {
            if (priceChart.data.labels.length > 15) { priceChart.data.labels.shift(); priceChart.data.datasets.forEach(dataset => dataset.data.shift()); }
            priceChart.data.labels.push(currentTime);
            topCoins.forEach((coin, index) => { priceChart.data.datasets[index].data.push(coin.current_price); });
            priceChart.update('none');
        }
    };

    const fetchDashboardData = async () => {
        try {
            loadingSpinner.style.display = 'block';
            const [coinsRes, globalRes] = await Promise.all([fetch(API_COINS_URL), fetch(API_GLOBAL_URL)]);
            if (!coinsRes.ok || !globalRes.ok) throw new Error('Network response was not ok.');
            const coinsData = await coinsRes.json();
            const globalData = await globalRes.json();
            renderMarketOverview(globalData);
            renderTable(coinsData);
            updateDashboardChart(coinsData);
        } catch (error) {
            console.error('Fetch error:', error);
            tableBodyEl.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger);">Gagal memuat data. Periksa koneksi internet Anda.</td></tr>`;
        } finally {
            loadingSpinner.style.display = 'none';
        }
    };

    // --- DETAIL PAGE LOGIC ---
    const showCoinDetail = async (coinId) => {
        currentCoinId = coinId;
        showView('detail');
        loadingSpinnerDetail.style.display = 'block';
        detailContent.style.display = 'none';

        try {
            const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`);
            if (!res.ok) throw new Error('Failed to fetch coin details');
            const data = await res.json();
            renderDetailPage(data);
            // Set initial active button and fetch chart
            document.querySelector('.time-button.active')?.classList.remove('active');
            document.querySelector('[data-days="7"]').classList.add('active');
            await fetchAndRenderDetailChart(coinId, 7);
        } catch (error) {
            console.error('Detail fetch error:', error);
            detailContent.innerHTML = '<p style="color: var(--danger); text-align: center;">Gagal memuat detail koin.</p>';
        } finally {
            loadingSpinnerDetail.style.display = 'none';
            detailContent.style.display = 'block';
        }
    };

    const renderDetailPage = (coin) => {
        document.getElementById('detail-image').src = coin.image.large;
        document.getElementById('detail-name').textContent = coin.name;
        document.getElementById('detail-symbol').textContent = `(${coin.symbol.toUpperCase()})`;
        document.getElementById('detail-description-text').innerHTML = coin.description.en || 'Deskripsi tidak tersedia.';

        const stats = [
            { label: 'Harga Saat Ini', value: `$${coin.market_data.current_price.usd.toLocaleString()}` },
            { label: 'Perubahan 24j', value: `${coin.market_data.price_change_percentage_24h.toFixed(2)}%`, class: coin.market_data.price_change_percentage_24h >= 0 ? 'text-success' : 'text-danger' },
            { label: 'Kapitalisasi Pasar', value: `$${formatNumber(coin.market_data.market_cap.usd)}` },
            { label: 'Volume 24j', value: `$${formatNumber(coin.market_data.total_volume.usd)}` },
            { label: 'All-Time High', value: `$${coin.market_data.ath.usd.toLocaleString()}` },
            { label: 'Supply Beredar', value: formatNumber(coin.market_data.circulating_supply) },
        ];
        document.getElementById('detail-stats').innerHTML = stats.map(stat => `
            <div class="stat-card">
                <h3>${stat.label}</h3>
                <p class="${stat.class || ''}">${stat.value}</p>
            </div>
        `).join('');
    };

    const fetchAndRenderDetailChart = async (coinId, days) => {
        try {
            const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
            if (!res.ok) throw new Error('Failed to fetch chart data');
            const data = await res.json();
            renderDetailChart(data.prices, days);
        } catch (error) {
            console.error('Chart fetch error:', error);
            const chartContainer = document.getElementById('detailChart').getContext('2d');
            chartContainer.clearRect(0, 0, chartContainer.canvas.width, chartContainer.canvas.height);
        }
    };

    const renderDetailChart = (priceData, days) => {
        const ctx = document.getElementById('detailChart').getContext('2d');
        const labels = priceData.map(p => formatChartLabel(p[0], days));
        const data = priceData.map(p => p[1]);

        if (detailChart) {
            detailChart.destroy();
        }

        detailChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Harga (${days} Hari)`,
                    data: data,
                    borderColor: 'var(--accent-blue)',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { ticks: { color: '#a0a0b8', callback: value => '$' + value.toFixed(2) }, grid: { color: '#2a2a4e' } },
                    x: { ticks: { color: '#a0a0b8', maxTicksLimit: 8 }, grid: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#191933',
                        titleColor: '#ffffff',
                        bodyColor: '#a0a0b8',
                        borderColor: '#2a2a4e',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `Harga: $${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    };

    // --- EVENT LISTENERS ---
    backButton.addEventListener('click', () => showView('dashboard'));

    timeSelector.addEventListener('click', (e) => {
        if (e.target.classList.contains('time-button')) {
            document.querySelector('.time-button.active').classList.remove('active');
            e.target.classList.add('active');
            const days = e.target.dataset.days;
            if (currentCoinId) {
                fetchAndRenderDetailChart(currentCoinId, days);
            }
        }
    });

    // --- INITIALIZATION ---
    fetchDashboardData();
    updateInterval = setInterval(fetchDashboardData, 15000); // Update every 15 seconds
});
