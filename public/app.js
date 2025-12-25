// Theme Management
class ThemeManager {
    constructor() {
        this.theme = localStorage.getItem('theme') || 'light';
        this.init();
    }

    init() {
        this.applyTheme();
        this.bindEvents();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        localStorage.setItem('theme', this.theme);
    }

    toggle() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        
        // Add a subtle animation feedback
        const toggleBtn = document.getElementById('theme-toggle');
        toggleBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            toggleBtn.style.transform = '';
        }, 150);
    }

    bindEvents() {
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }
    }
}

class ParticleSystem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouseX = -1000;
        this.mouseY = -1000;
        this.mouseRadius = 180;
        this.particleCount = 600;
        this.maxDistance = 80;
        this.isRunning = true;
        this.init();
    }
    init() {
        this.resize();
        this.createParticles();
        this.bindEvents();
        this.animate();
    }
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 1.5 + 0.5
            });
        }
    }
    bindEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.createParticles();
        });
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        window.addEventListener('mouseout', () => {
            this.mouseX = -1000;
            this.mouseY = -1000;
        });
        document.addEventListener('visibilitychange', () => {
            this.isRunning = !document.hidden;
            if (this.isRunning) {
                this.animate();
            }
        });
    }
    getColors() {
        const style = getComputedStyle(document.documentElement);
        const particle = style.getPropertyValue('--accent').trim() || 'rgba(6, 182, 212, 1)';
        return {
            particle,
            line: 'rgba(6, 182, 212, 0.15)'
        };
    }
    animate() {
        if (!this.isRunning) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const colors = this.getColors();
        const grid = {};
        const cellSize = this.maxDistance;
        this.particles.forEach((p, i) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vx += (Math.random() - 0.5) * 0.02;
            p.vy += (Math.random() - 0.5) * 0.02;
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (speed > 0.8) {
                p.vx = (p.vx / speed) * 0.8;
                p.vy = (p.vy / speed) * 0.8;
            }
            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;
            const cx = Math.floor(p.x / cellSize);
            const cy = Math.floor(p.y / cellSize);
            const key = `${cx},${cy}`;
            (grid[key] = grid[key] || []).push(i);
        });
        this.ctx.lineWidth = 0.5;
        for (const key in grid) {
            const [cx, cy] = key.split(',').map(Number);
            const idxs = grid[key];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nk = `${cx + dx},${cy + dy}`;
                    const nidxs = grid[nk];
                    if (!nidxs) continue;
                    for (const i of idxs) {
                        for (const j of nidxs) {
                            if (i >= j) continue;
                            const p1 = this.particles[i];
                            const p2 = this.particles[j];
                            const dx2 = p1.x - p2.x;
                            const dy2 = p1.y - p2.y;
                            const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                            if (dist < this.maxDistance) {
                                const opacity = (1 - dist / this.maxDistance) * 0.15;
                                this.ctx.beginPath();
                                this.ctx.moveTo(p1.x, p1.y);
                                this.ctx.lineTo(p2.x, p2.y);
                                this.ctx.strokeStyle = `rgba(6, 182, 212, ${opacity})`;
                                this.ctx.stroke();
                            }
                        }
                    }
                }
            }
        }
        if (this.mouseX > 0 && this.mouseY > 0) {
            this.particles.forEach(p => {
                const dx = this.mouseX - p.x;
                const dy = this.mouseY - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.mouseRadius) {
                    const force = (1 - dist / this.mouseRadius) * 0.02;
                    p.vx += (dx / dist) * force;
                    p.vy += (dy / dist) * force;
                }
            });
        }
        this.ctx.fillStyle = colors.particle;
        this.particles.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fill();
        });
        requestAnimationFrame(() => this.animate());
    }
}

// Animation Utilities
class AnimationUtils {
    static fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        let start = null;
        const animate = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const opacity = Math.min(progress / duration, 1);
            
            element.style.opacity = opacity;
            
            if (progress < duration) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    static slideIn(element, duration = 300) {
        element.classList.add('show');
    }

    static addLoadingState(element) {
        element.classList.add('loading');
        // Only set text to Loading... if the element is empty or explicitly requested
        // This prevents flickering during data updates
        if (!element.textContent || element.textContent.trim() === '') {
            element.textContent = 'Loading...';
        }
    }

    static removeLoadingState(element, content) {
        element.classList.remove('loading');
        element.textContent = content;
    }

    static showError(element, message) {
        element.style.color = 'var(--accent)';
        element.textContent = message;
        
        // Reset color after 3 seconds
        setTimeout(() => {
            element.style.color = '';
        }, 3000);
    }
}

// Data Formatting Utilities
class DataFormatter {
    static formatHashrate(hashrate) {
        if (!hashrate || hashrate === 'Not found') return 'Not found';
        
        const num = parseFloat(hashrate);
        if (isNaN(num)) return hashrate;
        
        if (num >= 1e12) return `${(num / 1e12).toFixed(2)} TH/s`;
        if (num >= 1e9) return `${(num / 1e9).toFixed(2)} GH/s`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)} MH/s`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(2)} KH/s`;
        return `${num.toFixed(2)} H/s`;
    }

    static formatReward(reward) {
        if (!reward || reward === 'No reward yet') return 'No reward yet';
        
        const num = parseFloat(reward);
        if (isNaN(num)) return reward;
        
        return `${num.toFixed(8)} SHAI`;
    }

    static formatNumber(num) {
        if (typeof num !== 'number') return num;
        return num.toLocaleString();
    }

    static formatPayout(payout) {
        if (!payout || payout === 'N/A') return 'N/A';
        
        const num = parseFloat(payout);
        if (isNaN(num)) return payout;
        
        return `${num.toFixed(4)} SHAI`;
    }

    static formatDifficulty(difficulty) {
        if (!difficulty) return 'N/A';
        
        const num = parseFloat(difficulty);
        if (isNaN(num)) return difficulty;
        
        if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
        return num.toFixed(2);
    }

    static formatTime(timestamp) {
        if (!timestamp) return 'N/A';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    static truncateHash(hash, length = 12) {
        if (!hash) return 'N/A';
        if (hash.length <= length) return hash;
        return hash.substring(0, length) + '...';
    }

    static truncateAddress(address, startLength = 8, endLength = 6) {
        if (!address) return 'N/A';
        if (address.length <= startLength + endLength) return address;
        return address.substring(0, startLength) + '...' + address.substring(address.length - endLength);
    }
}

// Shares Manager
class SharesManager {
    constructor() {
        this.updateInterval = null;
        this.isLoading = false;
        this.currentMinerAddress = null;
    }

    async updateShares(minerAddress = null) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        const sharesContainer = document.getElementById('shares-list');
        const refreshIcon = document.getElementById('shares-refresh-icon');
        
        if (refreshIcon) {
            refreshIcon.classList.add('spinning');
        }

        try {
            const url = minerAddress 
                ? `/recent-shares?limit=20&address=${encodeURIComponent(minerAddress)}`
                : '/recent-shares?limit=20';
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.displayShares(data || []);
            
        } catch (error) {
            console.error('Error fetching shares:', error);
            this.showSharesError();
        } finally {
            this.isLoading = false;
            if (refreshIcon) {
                setTimeout(() => {
                    refreshIcon.classList.remove('spinning');
                }, 500);
            }
        }
    }

    displayShares(shares) {
        const sharesContainer = document.getElementById('shares-list');
        const sharesCount = document.getElementById('shares-count');
        
        if (!sharesContainer) return;

        if (shares.length === 0) {
            sharesContainer.innerHTML = `
                <div class="shares-empty">
                    <i class="fas fa-cube"></i>
                    <h3>No Recent Shares</h3>
                    <p>No shares have been submitted recently. Start mining to see share records here.</p>
                </div>
            `;
            if (sharesCount) sharesCount.textContent = '0 recent shares';
            return;
        }

        if (sharesCount) {
            sharesCount.textContent = `${shares.length} recent shares`;
        }

        const sharesHTML = shares.map(share => `
            <div class="share-item">
                <div class="share-col miner-col" data-label="Miner ID">
                    <span class="miner-id" title="${share.minerId}">
                        ${DataFormatter.truncateAddress(share.minerId)}
                    </span>
                </div>
                <div class="share-col hash-col" data-label="Share Hash">
                    <span class="share-hash" title="${share.hash}">
                        ${DataFormatter.truncateHash(share.hash, 16)}
                    </span>
                </div>
                <div class="share-col difficulty-col" data-label="Difficulty">
                    <span class="share-difficulty">
                        ${DataFormatter.formatDifficulty(share.difficulty)}
                    </span>
                </div>
                <div class="share-col time-col" data-label="Time">
                    <span class="share-time" title="${new Date(share.timestamp).toLocaleString()}">
                        ${DataFormatter.formatTime(share.timestamp)}
                    </span>
                </div>
            </div>
        `).join('');

        sharesContainer.innerHTML = sharesHTML;
    }

    showSharesError() {
        const sharesContainer = document.getElementById('shares-list');
        if (sharesContainer) {
            sharesContainer.innerHTML = `
                <div class="shares-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error Loading Shares</h3>
                    <p>Failed to load recent shares. Please check your connection and try again.</p>
                </div>
            `;
        }
    }

    startAutoUpdate(minerAddress) {
        this.stopAutoUpdate();
        this.currentMinerAddress = minerAddress;
        this.updateInterval = setInterval(() => {
            this.updateShares(this.currentMinerAddress);
        }, 10000);
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.currentMinerAddress = null;
    }

    showSharesSection() {
        const sharesSection = document.getElementById('shares-section');
        if (sharesSection) {
            sharesSection.style.display = 'block';
        }
    }

    hideSharesSection() {
        const sharesSection = document.getElementById('shares-section');
        if (sharesSection) {
            sharesSection.style.display = 'none';
        }
    }
}

// Blocks Manager
class BlocksManager {
    constructor() {
        this.updateInterval = null;
        this.isLoading = false;
        this.blocks = [];
        this.showPoolOnly = false;
        this.poolAddress = null;
        this.init();
    }

    init() {
        this.bindFilterEvents();
        this.startAutoUpdate();
        this.updateBlocks();
    }

    bindFilterEvents() {
        const filterBtn = document.getElementById('filter-pool-blocks');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                this.showPoolOnly = !this.showPoolOnly;
                
                // Update button style
                if (this.showPoolOnly) {
                    filterBtn.style.background = 'var(--accent)';
                    filterBtn.style.color = '#ffffff';
                    filterBtn.querySelector('span').textContent = 'Show All';
                } else {
                    filterBtn.style.background = 'var(--bg-secondary)';
                    filterBtn.style.color = 'var(--text-secondary)';
                    filterBtn.querySelector('span').textContent = 'Show Pool Only';
                }
                
                this.displayBlocks(this.blocks);
            });
        }
    }

    async updateBlocks() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        try {
            const response = await fetch('/recent-blocks?limit=100');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.blocks = data || [];
            this.displayBlocks(this.blocks);
            
            if (this.poolAddress) {
                this.updateMaturingCount(this.poolAddress);
            }
            
        } catch (error) {
            console.error('Error fetching blocks:', error);
            this.showBlocksError();
        } finally {
            this.isLoading = false;
        }
    }

    updateMaturingCount(poolAddress) {
        const mEl = document.getElementById('pool-maturing');
        if (!mEl) return;
        if (!poolAddress || this.blocks.length === 0) return;
        
        const count = this.blocks.filter(b => b.miner === poolAddress).length;
        mEl.textContent = count;
        mEl.classList.remove('loading');
    }

    displayBlocks(blocks) {
        const blocksContainer = document.getElementById('blocks-list');
        if (!blocksContainer) return;

        const filteredBlocks = (this.showPoolOnly && this.poolAddress) 
            ? blocks.filter(b => b.miner === this.poolAddress)
            : blocks;

        if (filteredBlocks.length === 0) {
            blocksContainer.innerHTML = `
                <div class="blocks-loading">
                    <i class="fas fa-cube"></i>
                    <span>${this.showPoolOnly ? 'No pool blocks found recently' : 'No recent blocks found'}</span>
                </div>
            `;
            return;
        }

        const blocksHTML = filteredBlocks.map(block => `
            <div class="block-item" onclick="window.open('https://blocks.shaicoin.com/block/${block.hash}', '_blank')">
                <div class="block-item-header">
                    <div class="block-height">
                        <i class="fas fa-cube"></i>
                        <span>#${block.height}</span>
                    </div>
                    <span class="block-time">${DataFormatter.formatTime(block.time * 1000)}</span>
                </div>
                <div class="block-miner">
                    <i class="fas fa-hammer"></i>
                    <span class="block-miner-address" title="${block.miner}">${DataFormatter.truncateAddress(block.miner, 12, 8)}</span>
                </div>
                <div class="block-stats">
                    <div class="block-stat" title="Transactions">
                        <i class="fas fa-exchange-alt"></i>
                        <span>${block.txCount}</span>
                    </div>
                    <div class="block-stat" title="Size">
                        <i class="fas fa-file-alt"></i>
                        <span>${(block.size / 1024).toFixed(2)} KB</span>
                    </div>
                </div>
            </div>
        `).join('');

        blocksContainer.innerHTML = blocksHTML;
    }

    showBlocksError() {
        const blocksContainer = document.getElementById('blocks-list');
        if (blocksContainer) {
            blocksContainer.innerHTML = `
                <div class="blocks-loading">
                    <i class="fas fa-exclamation-triangle" style="color: var(--accent)"></i>
                    <span>Error loading blocks</span>
                </div>
            `;
        }
    }

    startAutoUpdate() {
        this.stopAutoUpdate();
        this.updateInterval = setInterval(() => {
            this.updateBlocks();
        }, 30000); // Update every 30 seconds
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}

// Bee Assistant Manager
class BeeAssistant {
    constructor() {
        this.container = document.getElementById('bee-assistant');
        this.speechBubble = this.container ? this.container.querySelector('.speech-bubble') : null;
        this.messages = [
            "Welcome to Shaicoin Pool! 🐝",
            "Happy Mining! ⛏️",
            "Shaicoin to the Moon! 🚀",
            "Bzzzz... finding blocks! 📦",
            "Have a great day! ☀️",
            "Keep hashing! 💪",
            "Need help? Check docs! 📚",
            "Pool is running smoothly! ✨",
            "You are awesome! 🌟",
            "Let's mine some coins! 💰",
            "Safety first, hashing second! 🛡️",
            "Did you hydrate today? 💧",
            "Bee-lieve in yourself! 🐝",
            "To the moon and bee-yond! 🌕",
            "Buzzing with energy! ⚡",
            "Making honey... I mean money! 🍯"
        ];
        this.init();
    }

    init() {
        if (!this.container || !this.speechBubble) return;
        this.bindEvents();
    }

    bindEvents() {
        this.container.addEventListener('click', () => this.showMessage());
        this.container.addEventListener('mouseenter', () => this.showMessage());
    }

    showMessage() {
        if (this.container.classList.contains('speaking')) return;
        
        // Pick random message
        const msg = this.messages[Math.floor(Math.random() * this.messages.length)];
        this.speechBubble.textContent = msg;
        
        // Show message
        this.container.classList.add('speaking');
        
        // Hide after 3 seconds
        setTimeout(() => {
            this.container.classList.remove('speaking');
        }, 3000);
    }
}

// Mining Pool Dashboard
class MiningPoolDashboard {
    constructor() {
        this.isSearching = false;
        this.updateInterval = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.startAutoUpdate();
        this.updatePoolData();
    }

    bindEvents() {
        // Search functionality
        const searchBtn = document.getElementById('search-button');
        const addressInput = document.getElementById('miner-address');
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchMiner());
        }
        
        if (addressInput) {
            // Search on Enter key
            addressInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchMiner();
                }
            });
            
            // Clear results when input is cleared
            addressInput.addEventListener('input', (e) => {
                if (!e.target.value.trim()) {
                    this.hideMinerResults();
                }
            });
        }
    }

    async searchMiner() {
        if (this.isSearching) return;
        
        const address = document.getElementById('miner-address').value.trim();
        if (!address) {
            this.showNotification('Please enter a miner address', 'warning');
            return;
        }

        this.isSearching = true;
        const searchBtn = document.getElementById('search-button');
        const originalContent = searchBtn.innerHTML;
        
        // Update button state
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Searching...</span>';
        searchBtn.disabled = true;

        try {
            const response = await fetch(`/miner?address=${encodeURIComponent(address)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.displayMinerData(data);
            
        } catch (error) {
            console.error('Error fetching miner data:', error);
            this.showNotification('Failed to fetch miner data. Please try again.', 'error');
        } finally {
            // Restore button state
            searchBtn.innerHTML = originalContent;
            searchBtn.disabled = false;
            this.isSearching = false;
        }
    }

    displayMinerData(data) {
        const hashrateElement = document.getElementById('miner-hashrate');
        const rewardElement = document.getElementById('miner-reward');
        const resultsContainer = document.getElementById('miner-data');

        if (hashrateElement && rewardElement && resultsContainer) {
            hashrateElement.textContent = DataFormatter.formatHashrate(data.hashrate);
            rewardElement.textContent = DataFormatter.formatReward(data.currentReward);
            
            AnimationUtils.slideIn(resultsContainer);
            
            this.showNotification('Miner data loaded successfully!', 'success');
            
            const address = document.getElementById('miner-address').value.trim();
            if (address && window.sharesManager) {
                window.sharesManager.showSharesSection();
                window.sharesManager.updateShares(address);
                window.sharesManager.startAutoUpdate(address);
            }
        }
    }

    hideMinerResults() {
        const resultsContainer = document.getElementById('miner-data');
        if (resultsContainer) {
            resultsContainer.classList.remove('show');
        }
        if (window.sharesManager) {
            window.sharesManager.stopAutoUpdate();
            window.sharesManager.hideSharesSection();
        }
    }

    async updatePoolData() {
        const elements = {
            hashrate: document.getElementById('total-hashrate'),
            miners: document.getElementById('connected-miners'),
            payout: document.getElementById('minimum-payout'),
            fee: document.getElementById('pool_fee'),
            poolAddress: document.getElementById('pool-mining-address'),
            poolConnection: document.getElementById('pool-connection')
        };

        // Add loading states
        Object.values(elements).forEach(el => {
            if (el) AnimationUtils.addLoadingState(el);
        });

        try {
            const response = await fetch('/pool-stats');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Update elements with formatted data
            if (elements.hashrate) {
                AnimationUtils.removeLoadingState(
                    elements.hashrate, 
                    DataFormatter.formatHashrate(data.totalHashrate)
                );
            }
            
            if (elements.miners) {
                AnimationUtils.removeLoadingState(
                    elements.miners, 
                    DataFormatter.formatNumber(data.connectedMiners)
                );
            }
            
            if (elements.payout) {
                AnimationUtils.removeLoadingState(
                    elements.payout, 
                    DataFormatter.formatPayout(data.minimumPayout)
                );
            }
            
            if (elements.fee) {
                AnimationUtils.removeLoadingState(
                    elements.fee, 
                    `${data.pool_fee}%`
                );
            }
            
            if (elements.poolAddress && data.poolMiningAddress) {
                elements.poolAddress.textContent = data.poolMiningAddress;
                elements.poolAddress.href = `https://blocks.shaicoin.com/address/${data.poolMiningAddress}`;
                elements.poolAddress.classList.remove('loading');
                
                // Update pool address in BlocksManager
                if (window.blocksManager) {
                    window.blocksManager.poolAddress = data.poolMiningAddress;
                    window.blocksManager.updateMaturingCount(data.poolMiningAddress);
                }
            }
            
            if (elements.poolConnection) {
                const connectionValue = data.poolConnection || 'Unset';
                elements.poolConnection.textContent = connectionValue;
                if (connectionValue !== 'Unset') {
                    elements.poolConnection.href = connectionValue;
                } else {
                    elements.poolConnection.href = '#';
                }
                elements.poolConnection.classList.remove('loading');
            }
            
        } catch (error) {
            console.error('Error fetching pool stats:', error);
            
            // Show error states
            Object.values(elements).forEach(el => {
                if (el) AnimationUtils.showError(el, 'Error loading');
            });
        }
    }

    startAutoUpdate() {
        // Update pool data every 10 seconds (to match shares update frequency)
        this.updateInterval = setInterval(() => {
            this.updatePoolData();
        }, 10000);
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                transform: translateX(100%);
                transition: transform 0.3s ease;
                max-width: 300px;
                word-wrap: break-word;
            `;
            document.body.appendChild(notification);
        }

        // Set notification style based on type
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;
        
        // Show notification
        notification.style.transform = 'translateX(0)';
        
        // Hide after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme manager
    new ThemeManager();
    
    // Initialize particle system
    window.particleSystem = new ParticleSystem('particle-canvas');

    // Initialize Bee Assistant
    window.beeAssistant = new BeeAssistant();

    window.dashboard = new MiningPoolDashboard();
    window.sharesManager = new SharesManager();
    window.blocksManager = new BlocksManager();
    
    document.documentElement.style.scrollBehavior = 'smooth';
});

document.addEventListener('visibilitychange', () => {
    if (window.dashboard) {
        if (document.hidden) {
            window.dashboard.stopAutoUpdate();
        } else {
            window.dashboard.startAutoUpdate();
            window.dashboard.updatePoolData();
        }
    }
    
    if (window.sharesManager && window.sharesManager.currentMinerAddress) {
        if (document.hidden) {
            window.sharesManager.stopAutoUpdate();
        } else {
            window.sharesManager.startAutoUpdate(window.sharesManager.currentMinerAddress);
        }
    }

    if (window.blocksManager) {
        if (document.hidden) {
            window.blocksManager.stopAutoUpdate();
        } else {
            window.blocksManager.startAutoUpdate();
            window.blocksManager.updateBlocks();
        }
    }
});

// Handle window beforeunload to cleanup
window.addEventListener('beforeunload', () => {
    if (window.dashboard) {
        window.dashboard.stopAutoUpdate();
    }
    
    if (window.sharesManager) {
        window.sharesManager.stopAutoUpdate();
    }

    if (window.blocksManager) {
        window.blocksManager.stopAutoUpdate();
    }
});
