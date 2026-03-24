window.AppTemplates = (() => {
    const storefrontTemplate = `
<template v-if="!isAdminEntry">
  <div class="page-shell">
    <header class="hero-card">
      <div class="hero-topbar">
        <div>
          <div class="brand-line">
            <span class="brand-name">{{ settings.store_name }}</span>
          </div>
          <p class="brand-desc">{{ settings.hero_badge }}</p>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" @click="openOrders">我的订单</button>
          <button class="ghost-btn" @click="scrollToSection('plans')">先看套餐</button>
          <button class="ghost-btn" @click="openBuilder('buy_device')">立即下单</button>
          <button v-if="currentUser" class="solid-btn alt" @click="logout">退出登录</button>
          <button v-else class="solid-btn" @click="showLoginModal = true">手机号登录</button>
        </div>
      </div>

      <div class="hero-layout">
        <section class="hero-copy">
          <p class="hero-kicker">物联卡不单卖，只做设备配卡与寄设备配卡</p>
          <h1>{{ settings.hero_title }}</h1>
          <p class="hero-summary">{{ settings.hero_subtitle }}</p>
          <div class="hero-cta">
            <button class="solid-btn large" @click="scrollToSection('plans')">先看资费图片</button>
            <button class="outline-btn light" @click="openBuilder('buy_device')">购买设备配卡</button>
            <button class="outline-btn light" @click="openBuilder('ship_device')">寄设备来配卡</button>
          </div>
          <div class="hero-tags">
            <span class="tag-chip">先看套餐图</span>
            <span class="tag-chip">再选下单路径</span>
            <span class="tag-chip">扫码付款后上传截图</span>
            <span class="tag-chip">人工审核后发货或回寄</span>
          </div>
          <div class="trust-strip">
            <article class="trust-card">
              <strong>现货设备可选</strong>
              <p>购买设备配卡用户可直接下单，热门设备优先展示。</p>
            </article>
            <article class="trust-card">
              <strong>人工审核收款</strong>
              <p>付款后上传截图，审核通过后再进入配卡与测试流程。</p>
            </article>
            <article class="trust-card">
              <strong>支持寄设备来配卡</strong>
              <p>已有设备的用户可直接填写信息寄来处理和回寄。</p>
            </article>
          </div>
        </section>
        <aside class="hero-side">
          <article class="hero-metric">
            <span>当前套餐</span>
            <strong>{{ plans.length }}</strong>
            <p>套餐内容以图片为主展示，文字只做补充说明。</p>
          </article>
          <article class="hero-metric accent">
            <span>现货设备</span>
            <strong>{{ devices.length }}</strong>
            <p>支持随身 WiFi、4G CPE 等设备选购配卡。</p>
          </article>
          <article class="hero-metric warm">
            <span>收款方式</span>
            <strong>微信 / 支付宝</strong>
            <p>下单后扫码付款，并上传付款截图等待人工审核。</p>
          </article>
        </aside>
      </div>
    </header>

    <section class="section-card intro-card">
      <div class="section-head">
        <div>
          <p class="section-kicker">新手下单</p>
          <h2>手机端三步完成下单</h2>
          <p class="section-desc">绝大多数用户都是手机访问，所以首页直接把最核心的 3 步说明清楚，避免来回问。</p>
        </div>
      </div>
      <div class="onboarding-grid">
        <article class="onboarding-item">
          <span class="onboarding-index">01</span>
          <h3>先看套餐图</h3>
            <p>套餐详细内容都以图片为准，看完资费后再决定如何下单。</p>
        </article>
        <article class="onboarding-item">
          <span class="onboarding-index">02</span>
          <h3>选购买方式</h3>
          <p>没设备就直接买设备配卡，已有设备就填写资料寄设备来配卡。</p>
        </article>
        <article class="onboarding-item">
          <span class="onboarding-index">03</span>
          <h3>扫码付款并上传截图</h3>
          <p>上传成功后进入人工审核，审核通过再安排配卡、测试、发货或回寄。</p>
        </article>
      </div>
    </section>

    <section class="section-card" id="plans">
      <div class="section-head">
        <div>
          <p class="section-kicker">第一步</p>
          <h2>先看物联卡套餐资费</h2>
          <p class="section-desc">首页先展示套餐资费图。用户看完图，再选择购买设备配卡或寄设备来配卡，完全符合你的成交逻辑。</p>
        </div>
        <button class="outline-btn" @click="openBuilder('buy_device')">看完直接下单</button>
      </div>

      <div v-if="plans.length" class="plan-quick-grid">
        <button v-for="(plan, index) in plans" :key="plan.id" class="plan-quick-card" :class="{ active: builderForm.plan_id === plan.id }" @click="builderForm.plan_id = plan.id">
          <div class="plan-quick-media" @dblclick.stop.prevent="previewImage(planImage(plan))" @touchend.stop.prevent="handleQuickPlanTouch(plan)">
            <img :src="planImage(plan)" :alt="plan.name">
            <span v-if="isHotPlan(plan, index)" class="spotlight-tag">热销套餐</span>
          </div>
          <div class="plan-quick-info">
            <span class="mini-badge">{{ plan.badge || plan.network_type || '套餐' }}</span>
            <strong>{{ plan.name }}</strong>
            <span>{{ plan.carrier || '多网可选' }} / {{ plan.network_type || '4G/5G' }}</span>
            <span class="sales-copy">{{ planSalesText(plan, index) }}</span>
          </div>
        </button>
      </div>
      <article v-if="selectedPlan" class="plan-focus-card">
        <div class="plan-visual spotlight" @click="previewImage(planImage(selectedPlan))">
          <img :src="planImage(selectedPlan)" :alt="selectedPlan.name">
          <div class="zoom-tip">点击查看大图</div>
        </div>
        <div class="plan-content">
          <div class="card-headline">
            <div>
              <span class="mini-badge">{{ selectedPlan.badge || selectedPlan.network_type || '套餐方案' }}</span>
              <h3>{{ selectedPlan.name }}</h3>
            </div>
            <div class="price-box">
              <strong>{{ selectedPlan.monthly_price > 0 ? currency(selectedPlan.monthly_price) : '以图为准' }}</strong>
              <span>{{ selectedPlan.monthly_price > 0 ? '/ 月参考' : '资费以图片为准' }}</span>
            </div>
          </div>
          <div class="info-grid">
            <div><span>套餐流量</span><strong>{{ selectedPlan.monthly_data || '以图片说明为准' }}</strong></div>
            <div><span>配卡服务</span><strong>{{ selectedPlan.setup_price > 0 ? currency(selectedPlan.setup_price) : '咨询客服' }}</strong></div>
            <div><span>网络类型</span><strong>{{ selectedPlan.network_type || '4G/5G' }}</strong></div>
            <div><span>运营商</span><strong>{{ selectedPlan.carrier || '多网可选' }}</strong></div>
          </div>
          <p class="body-copy">{{ selectedPlan.best_for || '适合根据设备场景灵活搭配。' }}</p>
          <p class="muted-copy">套餐具体资费、速率、地区限制等都以图片内容为准。</p>
          <div class="sales-panel">
            <span class="spotlight-chip">{{ selectedPlan.featured ? '当前热销套餐' : '热门搭配推荐' }}</span>
            <p>{{ planSalesText(selectedPlan, plans.findIndex(item => item.id === selectedPlan.id)) }}</p>
          </div>
          <div class="pill-row">
            <span class="pill">{{ selectedPlan.coverage || '全国大部分地区可用' }}</span>
            <span class="pill">{{ selectedPlan.purchase_note || '不单独卖卡，只做设备配卡' }}</span>
            <span class="pill" v-for="tag in selectedPlan.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
          </div>
          <ul v-if="selectedPlan.features.length" class="feature-list">
            <li v-for="feature in selectedPlan.features" :key="feature">{{ feature }}</li>
          </ul>
          <div class="card-actions">
            <button class="outline-btn" @click="openBuilder('ship_device', { planId: selectedPlan.id })">寄设备配这个套餐</button>
            <button class="solid-btn" @click="openBuilder('buy_device', { planId: selectedPlan.id })">购买设备配这个套餐</button>
          </div>
        </div>
      </article>
      <div v-else class="empty-box">暂时还没有上架套餐，请先补充套餐图片和说明。</div>
    </section>

    <section class="section-card" id="flows">
      <div class="section-head">
        <div>
          <p class="section-kicker">第二步</p>
          <h2>选择你的下单方式</h2>
          <p class="section-desc">两条路径都要先确定套餐。区别在于，一条是直接购买设备配卡，另一条是用户自己寄设备过来配卡和测试。</p>
        </div>
      </div>
      <div class="flow-grid">
        <article class="flow-card">
          <div class="flow-top"><span class="flow-badge">方案 A</span><h3>购买设备配卡</h3></div>
          <p class="body-copy">适合还没有设备的用户。先看套餐图，再选设备型号和可配套餐，扫码付款后上传付款截图，审核通过后完成配卡和发货。</p>
          <ol class="step-list"><li v-for="step in settings.buy_flow_steps" :key="step">{{ step }}</li></ol>
          <button class="solid-btn wide-btn" @click="openBuilder('buy_device')">进入购买设备配卡</button>
        </article>
        <article class="flow-card secondary">
          <div class="flow-top"><span class="flow-badge">方案 B</span><h3>寄设备来配卡</h3></div>
          <p class="body-copy">适合已经有设备的用户。先选套餐，再填写设备品牌、型号、设备情况和寄出单号，商家收到设备后配卡测试并回寄。</p>
          <ol class="step-list"><li v-for="step in settings.ship_flow_steps" :key="step">{{ step }}</li></ol>
          <button class="solid-btn wide-btn" @click="openBuilder('ship_device')">进入寄设备配卡</button>
        </article>
      </div>
    </section>

    <section class="section-card" id="hot-bundles">
      <div v-if="shopReceivingText" class="address-spotlight">
        <div>
          <p class="section-kicker">寄设备地址</p>
          <h3>寄设备配卡前，先确认商家收件信息</h3>
          <p class="body-copy">{{ shopReceivingText }}</p>
          <p class="muted-copy">后台修改后，这里的收件人、电话和地址会实时同步更新，用户下单前可以直接复制使用。</p>
        </div>
        <button class="solid-btn" @click="copyText(shopReceivingText, '寄送地址已复制')">复制寄送地址</button>
      </div>
      <div class="section-head">
        <div>
          <p class="section-kicker">热门搭配</p>
          <h2>直接选热门设备与套餐组合</h2>
          <p class="section-desc">适合不想反复筛选的手机端用户，直接从常见组合里快速进入下单。</p>
        </div>
      </div>
      <div v-if="featuredBundles.length" class="bundle-grid">
        <article v-for="bundle in featuredBundles" :key="bundle.key" class="bundle-card">
          <div class="bundle-cover">
            <div class="bundle-media">
              <img :src="deviceImage(bundle.device)" :alt="bundle.device.name">
            </div>
            <div class="bundle-media plan-side">
              <img :src="planImage(bundle.plan)" :alt="bundle.plan.name">
            </div>
          </div>
          <div class="bundle-content">
            <span class="spotlight-chip">热门搭配</span>
            <h3>{{ bundle.device.name }} + {{ bundle.plan.name }}</h3>
            <p>{{ bundle.description }}</p>
            <div class="pill-row">
              <span class="pill">{{ bundle.device.network_type || '4G/5G' }}</span>
              <span class="pill">配卡费 {{ currency(bundle.plan.setup_price) }}</span>
              <span class="pill">设备价 {{ currency(bundle.device.price) }}</span>
            </div>
            <button class="solid-btn wide-btn" @click="openBuilder('buy_device', { deviceId: bundle.device.id, planId: bundle.plan.id })">直接下这组</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-box">当前还没有可用的热门搭配组合。</div>
    </section>

    <section class="section-card" id="devices">
      <div class="section-head">
        <div>
          <p class="section-kicker">第三步</p>
          <h2>设备选购区</h2>
          <p class="section-desc">如果用户选择购买设备配卡，就在这里继续选设备。设备和套餐会一起进入订单，不会出现单独卖卡的路径。</p>
        </div>
      </div>
      <div v-if="devices.length" class="device-grid">
        <article v-for="(device, index) in devices" :key="device.id" class="device-card">
          <div class="device-cover" @click="previewImage(deviceImage(device))">
            <img :src="deviceImage(device)" :alt="device.name">
            <span class="floating-label">{{ device.badge || deviceCategoryText(device.category) }}</span>
            <span v-if="isHotDevice(device, index)" class="spotlight-tag device">热销设备</span>
          </div>
          <div class="device-info">
            <div class="card-headline">
              <div>
                <h3>{{ device.name }}</h3>
                <p class="model-text">{{ device.model }} / {{ device.network_type || '4G/5G' }}</p>
              </div>
              <div class="price-box">
                <strong>{{ currency(device.price) }}</strong>
                <span v-if="device.original_price > device.price" class="strike-text">{{ currency(device.original_price) }}</span>
              </div>
            </div>
              <p class="body-copy">{{ device.short_description || '上传设备图片后可在这里展示完整介绍。' }}</p>
            <p class="sales-copy">{{ deviceSalesText(device, index) }}</p>
            <p class="muted-copy compatibility-note">{{ deviceCompatibilityText(device) }}</p>
            <div class="pill-row">
              <span class="pill">{{ deviceCategoryText(device.category) }}</span>
              <span class="pill">库存 {{ device.stock }}</span>
              <span class="pill">可配 {{ compatiblePlanCount(device) }} 个套餐</span>
              <span class="pill" v-for="tag in device.tags.slice(0, 2)" :key="tag">{{ tag }}</span>
            </div>
            <ul v-if="device.features.length" class="feature-list compact">
              <li v-for="feature in device.features" :key="feature">{{ feature }}</li>
            </ul>
            <button class="solid-btn wide-btn" :disabled="device.stock <= 0" @click="openBuilder('buy_device', { deviceId: device.id })">{{ device.stock > 0 ? '先选这台设备' : '暂时缺货' }}</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-box">暂时还没有设备上架，请先补充设备图片和介绍。</div>
    </section>

    <section class="service-strip">
      <article class="service-card"><p class="section-kicker">付款说明</p><h3>暂不接官方支付接口</h3><p>{{ settings.payment_notice }}</p></article>
      <article class="service-card"><p class="section-kicker">寄送说明</p><h3>寄设备配卡需要补全设备信息</h3><p>{{ settings.shipping_notice }}</p></article>
      <article class="service-card"><p class="section-kicker">售后说明</p><h3>人工审核、测试、发货一体化</h3><p>{{ settings.aftersales_notice }}</p></article>
    </section>

    <section class="section-card notes-grid">
      <article class="info-panel">
        <div class="section-head compact-head">
          <div>
            <p class="section-kicker">购买须知</p>
            <h2>下单前先看这些</h2>
          </div>
        </div>
        <ul class="feature-list">
          <li v-for="item in settings.purchase_rules" :key="item">{{ item }}</li>
        </ul>
      </article>
      <article class="info-panel">
        <div class="section-head compact-head">
          <div>
            <p class="section-kicker">寄送检查</p>
            <h2>寄设备前检查清单</h2>
          </div>
        </div>
        <ul class="feature-list">
          <li v-for="item in settings.ship_checklist" :key="item">{{ item }}</li>
        </ul>
      </article>
      <article class="info-panel">
        <div class="section-head compact-head">
          <div>
            <p class="section-kicker">发货时效</p>
            <h2>审核与处理说明</h2>
          </div>
        </div>
        <p class="body-copy">{{ settings.delivery_notice }}</p>
        <p class="muted-copy">{{ settings.region_notice }}</p>
      </article>
    </section>

    <section class="section-card faq-section">
      <div class="section-head">
        <div>
          <p class="section-kicker">常见问题</p>
          <h2>手机端下单前常问问题</h2>
          <p class="section-desc">把用户最常问的点提前说明清楚，能减少咨询、提高直接下单率。</p>
        </div>
      </div>
      <div class="faq-list">
        <article v-for="item in faqEntries" :key="item.question" class="faq-card">
          <strong>{{ item.question }}</strong>
          <p>{{ item.answer }}</p>
        </article>
      </div>
    </section>

    <footer class="footer-card">
      <div>
        <strong>{{ settings.store_name }}</strong>
        <p>{{ settings.announcement }}</p>
      </div>
      <div class="footer-meta">
        <span>客服手机：{{ settings.service_phone || '未设置' }}</span>
        <span>客服微信：{{ settings.service_wechat || '未设置' }}</span>
        <span>服务时间：{{ settings.business_hours || '未设置' }}</span>
      </div>
      <div class="footer-actions">
        <a v-if="settings.service_phone" class="solid-btn" :href="'tel:' + settings.service_phone">拨打客服</a>
        <button v-if="settings.service_wechat" class="outline-btn" @click="copyText(settings.service_wechat, '客服微信已复制')">复制客服微信</button>
      </div>
    </footer>

    <div class="mobile-action-bar">
      <button class="outline-btn" @click="scrollToSection('plans')">先看套餐</button>
      <button class="outline-btn" @click="copyText(settings.service_wechat, '客服微信已复制')" :disabled="!settings.service_wechat">联系客服</button>
      <button class="solid-btn" @click="openBuilder('buy_device')">立即下单</button>
    </div>
  </div>
</template>`;

    const adminTemplate = `
<template v-else>
  <div class="page-shell admin-shell" v-if="isAdminView && isAdmin">
    <header class="admin-hero">
      <div>
        <p class="section-kicker">后台管理</p>
        <h1>物联卡商城运营后台</h1>
        <p class="section-desc">统一管理套餐图片、设备图片、订单审核、收款码和前台文案。后续只需要在这里更新图片和说明即可。</p>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn dark" @click="refreshAdminData">刷新数据</button>
        <button class="solid-btn" @click="goStorefront">返回前台</button>
      </div>
    </header>

    <section class="tab-row">
      <button v-for="tab in adminTabs" :key="tab.value" class="tab-btn" :class="{ active: adminTab === tab.value }" @click="setAdminTab(tab.value)">{{ tab.label }}</button>
    </section>

    <section v-if="adminTab === 'dashboard'" class="admin-panel">
      <div class="dashboard-grid">
        <article class="dashboard-card"><span>上架套餐</span><strong>{{ adminDashboard.plan_count }}</strong></article>
        <article class="dashboard-card"><span>上架设备</span><strong>{{ adminDashboard.device_count }}</strong></article>
        <article class="dashboard-card"><span>订单总数</span><strong>{{ adminDashboard.order_count }}</strong></article>
        <article class="dashboard-card"><span>用户数量</span><strong>{{ adminDashboard.user_count }}</strong></article>
        <article class="dashboard-card accent"><span>累计金额</span><strong>{{ currency(adminDashboard.total_revenue) }}</strong></article>
        <article class="dashboard-card warn"><span>待审核订单</span><strong>{{ adminDashboard.pending_count }}</strong></article>
      </div>
      <div class="dashboard-grid secondary">
        <article class="summary-card"><h3>购买设备配卡订单</h3><strong>{{ adminDashboard.buy_device_count }}</strong></article>
        <article class="summary-card"><h3>寄设备配卡订单</h3><strong>{{ adminDashboard.ship_device_count }}</strong></article>
        <article class="summary-card wide-card">
          <h3>低库存提醒</h3>
          <div v-if="adminDashboard.low_stock_devices.length" class="inline-badges">
            <span v-for="device in adminDashboard.low_stock_devices" :key="device.id">{{ device.name }} / 库存 {{ device.stock }}</span>
          </div>
          <p v-else class="muted-copy">当前没有低库存设备。</p>
        </article>
      </div>
    </section>

    <section v-if="adminTab === 'plans'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>套餐管理</h2>
          <p class="section-desc">重点上传套餐图片，因为用户首页第一眼看到的就是套餐图。</p>
        </div>
        <button class="solid-btn" @click="openPlanEditor()">新增套餐</button>
      </div>
      <div class="admin-card-grid">
        <article v-for="plan in adminPlans" :key="plan.id" class="admin-item-card">
          <div class="admin-cover" @click="previewImage(planImage(plan))"><img :src="planImage(plan)" :alt="plan.name"></div>
          <div class="admin-item-body">
            <div class="card-headline">
              <div><span class="mini-badge">{{ plan.badge || '套餐' }}</span><h3>{{ plan.name }}</h3></div>
              <span class="status-pill" :class="plan.status">{{ plan.status === 'active' ? '上架中' : '已下架' }}</span>
            </div>
            <p class="body-copy">{{ plan.best_for || '暂无补充说明' }}</p>
            <div class="pill-row">
              <span class="pill">{{ plan.monthly_price > 0 ? currency(plan.monthly_price) + '/月' : '资费以图片为准' }}</span>
              <span class="pill">配卡费 {{ currency(plan.setup_price) }}</span>
              <span class="pill">{{ plan.network_type || '4G/5G' }}</span>
            </div>
            <div class="card-actions">
              <button class="outline-btn" @click="openPlanEditor(plan)">编辑</button>
              <button class="danger-btn" @click="deletePlan(plan)">删除</button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="adminTab === 'devices'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>设备管理</h2>
          <p class="section-desc">设备图片、卖点、库存和价格都在这里维护，前台会自动同步展示。</p>
        </div>
        <button class="solid-btn" @click="openDeviceEditor()">新增设备</button>
      </div>
      <div class="admin-card-grid">
        <article v-for="device in adminDevices" :key="device.id" class="admin-item-card">
          <div class="admin-cover" @click="previewImage(deviceImage(device))"><img :src="deviceImage(device)" :alt="device.name"></div>
          <div class="admin-item-body">
            <div class="card-headline">
              <div><span class="mini-badge">{{ device.badge || deviceCategoryText(device.category) }}</span><h3>{{ device.name }}</h3></div>
              <span class="status-pill" :class="device.status">{{ device.status === 'active' ? '上架中' : '已下架' }}</span>
            </div>
            <p class="body-copy">{{ device.short_description || '暂无设备描述' }}</p>
            <div class="pill-row">
              <span class="pill">{{ currency(device.price) }}</span>
              <span class="pill">库存 {{ device.stock }}</span>
              <span class="pill">{{ deviceCategoryText(device.category) }}</span>
            </div>
            <div class="card-actions">
              <button class="outline-btn" @click="openDeviceEditor(device)">编辑</button>
              <button class="danger-btn" @click="deleteDevice(device)">删除</button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="adminTab === 'orders'" class="admin-panel">
      <div class="toolbar">
        <input v-model.trim="adminOrderFilters.q" class="input" placeholder="搜索订单号、手机号、套餐名、设备名、快递单号">
        <select v-model="adminOrderFilters.status" class="input">
          <option value="all">全部状态</option>
          <option v-for="status in orderStatuses" :key="status" :value="status">{{ orderStatusText(status) }}</option>
        </select>
        <select v-model="adminOrderFilters.flow_type" class="input">
          <option value="all">全部下单方式</option>
          <option value="buy_device">购买设备配卡</option>
          <option value="ship_device">寄设备配卡</option>
        </select>
        <input v-model="adminOrderFilters.date_from" type="date" class="input" aria-label="开始日期">
        <input v-model="adminOrderFilters.date_to" type="date" class="input" aria-label="结束日期">
        <button class="solid-btn" :disabled="savingStates.adminOrders" @click="fetchAdminOrders">{{ savingStates.adminOrders ? '查询中...' : '查询' }}</button>
        <button class="outline-btn" :disabled="savingStates.exportOrders" @click="exportAdminOrders">{{ savingStates.exportOrders ? '导出中...' : '导出订单' }}</button>
      </div>
      <div v-if="adminOrders.length" class="order-admin-list">
        <article v-for="order in adminOrders" :key="order.id" class="order-admin-card" :class="{ urgent: isUrgentOrder(order) }">
          <div class="order-topline">
            <div>
              <div class="copy-inline">
                <strong>{{ order.order_no }}</strong>
                <button class="outline-btn small" @click="copyText(order.order_no, '订单号已复制')">复制订单号</button>
                <button class="outline-btn small" @click="copyText(order.customer_phone, '手机号已复制')">复制手机号</button>
                <button v-if="order.merchant_tracking_number" class="outline-btn small" @click="copyText(order.merchant_tracking_number, '快递单号已复制')">复制快递单号</button>
              </div>
              <p class="muted-copy">{{ flowTypeText(order.flow_type) }} / {{ order.customer_name }} / {{ order.customer_phone }}</p>
            </div>
            <span class="status-pill" :class="order.status">{{ orderStatusText(order.status) }}</span>
          </div>
          <div v-if="order.internal_tags && order.internal_tags.length" class="pill-row admin-tag-row">
            <span v-for="tag in order.internal_tags" :key="tag" class="pill">{{ tag }}</span>
          </div>
          <div class="detail-grid">
            <div class="detail-card"><span>套餐信息</span><strong>{{ order.plan_snapshot.name }}</strong><p>{{ order.plan_snapshot.monthly_data || '以套餐图为准' }} / 配卡费 {{ currency(order.plan_snapshot.setup_price) }}</p></div>
            <div class="detail-card">
              <span>设备信息</span>
              <strong>{{ order.device_snapshot ? order.device_snapshot.name : '用户寄送设备' }}</strong>
              <p v-if="order.device_snapshot">数量 {{ order.quantity }} / {{ currency(order.device_snapshot.price) }}</p>
              <p v-else>{{ [order.device_submission.brand, order.device_submission.model].filter(Boolean).join(' / ') || '未填写完整' }}</p>
            </div>
            <div class="detail-card">
              <span>付款信息</span>
              <strong>{{ paymentText(order.payment_method) }}</strong>
              <p>订单金额 {{ currency(order.total_amount) }}</p>
              <button v-if="order.payment_proof" class="outline-btn small" @click="previewImage(order.payment_proof)">查看付款截图</button>
            </div>
            <div class="detail-card"><span>地址与备注</span><strong>{{ order.shipping_address }}</strong><p>{{ order.remark || '用户未填写备注' }}</p></div>
          </div>
          <div v-if="order.flow_type === 'ship_device'" class="ship-info-box">
            <strong>寄设备信息</strong>
            <p>品牌型号：{{ [order.device_submission.brand, order.device_submission.model].filter(Boolean).join(' / ') || '未填写' }}</p>
            <p>设备是否可插卡：{{ insertCardText(order.device_submission.can_insert_card) }}</p>
            <p>设备是否已去控：{{ removeControlText(order.device_submission.remove_control) }}</p>
            <p>设备情况：{{ order.device_submission.condition || '未填写' }}</p>
            <p>寄出单号：{{ order.device_submission.outbound_tracking || '未填写' }}</p>
            <p>补充说明：{{ order.device_submission.notes || '未填写' }}</p>
          </div>
          <div class="editor-grid">
            <select v-model="order.status" class="input">
              <option v-for="status in orderStatuses" :key="status" :value="status">{{ orderStatusText(status) }}</option>
            </select>
            <input v-model.trim="order.logistics_company" class="input" placeholder="快递公司">
            <input v-model.trim="order.merchant_tracking_number" class="input" placeholder="商家回寄单号">
            <textarea v-model.trim="order.admin_note" class="input full-span" rows="3" placeholder="后台备注"></textarea>
          </div>
          <div class="template-row">
            <input v-model.trim="order.internal_tags_text" class="input full-span" placeholder="内部标签，多个可用逗号、顿号或换行分隔">
            <button v-for="template in adminNoteTemplates" :key="template" class="outline-btn small" @click="applyAdminNoteTemplate(order, template)">{{ template }}</button>
          </div>
          <div class="quick-status-row">
            <button class="outline-btn small" @click="setOrderStatus(order, 'pending_payment_review')">待审核</button>
            <button class="outline-btn small" @click="setOrderStatus(order, 'awaiting_device_delivery')">待收件</button>
            <button class="outline-btn small" @click="setOrderStatus(order, 'configuring')">配卡中</button>
            <button class="outline-btn small" @click="setOrderStatus(order, 'ready_to_ship')">待发货</button>
            <button class="outline-btn small" @click="setOrderStatus(order, 'shipped')">已发货</button>
          </div>
          <div v-if="order.processing_logs && order.processing_logs.length" class="log-panel">
            <div class="log-head">
              <strong>处理记录</strong>
              <span>{{ order.processing_logs.length }} 条</span>
            </div>
            <div class="log-list">
              <article v-for="log in reversedProcessingLogs(order)" :key="log.time + log.action + log.content" class="log-item">
                <div class="log-item-head">
                  <strong>{{ log.action || '订单记录' }}</strong>
                  <span>{{ formatDateTime(log.time) }}</span>
                </div>
                <p>{{ log.content || '暂无详情' }}</p>
              </article>
            </div>
          </div>
          <div class="card-actions"><button class="solid-btn" :disabled="isOrderSaving(order.id)" @click="saveAdminOrder(order)">{{ isOrderSaving(order.id) ? '保存中...' : '保存订单处理结果' }}</button></div>
        </article>
      </div>
      <div v-else class="empty-box">当前没有符合条件的订单。</div>
    </section>

    <section v-if="adminTab === 'settings'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>店铺设置</h2>
          <p class="section-desc">这里维护前台标题、副标题、客服联系方式、流程说明和收款二维码。</p>
        </div>
      </div>
      <div class="admin-form-grid">
        <input v-model.trim="adminSettingsForm.store_name" class="input" placeholder="店铺名称">
        <input v-model.trim="adminSettingsForm.hero_badge" class="input" placeholder="顶部短说明">
        <input v-model.trim="adminSettingsForm.hero_title" class="input full-span" placeholder="首页主标题">
        <textarea v-model.trim="adminSettingsForm.hero_subtitle" class="input full-span" rows="3" placeholder="首页副标题"></textarea>
        <input v-model.trim="adminSettingsForm.service_phone" class="input" placeholder="客服手机">
        <input v-model.trim="adminSettingsForm.service_wechat" class="input" placeholder="客服微信">
        <input v-model.trim="adminSettingsForm.business_hours" class="input" placeholder="服务时间">
        <input v-model.trim="adminSettingsForm.shop_receiving_name" class="input" placeholder="寄设备收件人/仓库名">
        <input v-model.trim="adminSettingsForm.shop_receiving_phone" class="input" placeholder="寄设备收件电话">
        <textarea v-model.trim="adminSettingsForm.shop_receiving_address" class="input full-span" rows="2" placeholder="寄设备收件地址"></textarea>
        <input v-model.number="adminSettingsForm.ship_service_fee" type="number" min="0" class="input" placeholder="寄设备配卡服务费">
        <input v-model.trim="adminSettingsForm.ship_service_title" class="input full-span" placeholder="寄设备配卡服务费名称">
        <textarea v-model.trim="adminSettingsForm.announcement" class="input full-span" rows="3" placeholder="公告说明"></textarea>
        <textarea v-model.trim="adminSettingsForm.payment_notice" class="input full-span" rows="3" placeholder="付款说明"></textarea>
        <textarea v-model.trim="adminSettingsForm.shipping_notice" class="input full-span" rows="3" placeholder="寄送说明"></textarea>
        <textarea v-model.trim="adminSettingsForm.aftersales_notice" class="input full-span" rows="3" placeholder="售后说明"></textarea>
        <textarea v-model.trim="adminSettingsForm.delivery_notice" class="input full-span" rows="3" placeholder="发货时效说明"></textarea>
        <textarea v-model.trim="adminSettingsForm.region_notice" class="input full-span" rows="3" placeholder="地区限制/使用说明"></textarea>
        <textarea v-model.trim="adminSettingsForm.buy_flow_steps_text" class="input full-span" rows="4" placeholder="购买设备配卡流程，一行一步"></textarea>
        <textarea v-model.trim="adminSettingsForm.ship_flow_steps_text" class="input full-span" rows="4" placeholder="寄设备配卡流程，一行一步"></textarea>
        <textarea v-model.trim="adminSettingsForm.ship_checklist_text" class="input full-span" rows="4" placeholder="寄设备检查清单，一行一条"></textarea>
        <textarea v-model.trim="adminSettingsForm.purchase_rules_text" class="input full-span" rows="4" placeholder="购买须知，一行一条"></textarea>
        <textarea v-model.trim="adminSettingsForm.faq_items_text" class="input full-span" rows="5" placeholder="常见问题，一行一条，格式：问题|答案"></textarea>
        <textarea v-model.trim="adminSettingsForm.admin_note_templates_text" class="input full-span" rows="4" placeholder="后台备注模板，一行一个"></textarea>
        <input v-model.trim="adminSettingsForm.share_title" class="input" placeholder="分享标题">
        <input v-model.trim="adminSettingsForm.share_description" class="input" placeholder="分享描述">
      </div>
      <div class="qr-grid">
        <article class="qr-card">
          <h3>微信收款码</h3>
          <div class="qr-preview" @click="settings.payment_qrs.wechat && previewImage(settings.payment_qrs.wechat)">
            <img v-if="settings.payment_qrs.wechat" :src="encodedImage(settings.payment_qrs.wechat)" alt="微信收款码">
            <div v-else class="qr-empty">暂未上传</div>
          </div>
          <label class="upload-field" :class="{ 'has-file': qrFiles.wechat || settings.payment_qrs.wechat }">
            <input class="upload-input" type="file" accept="image/*" @change="onQrFileChange($event, 'wechat')">
            <span class="upload-meta">
              <span class="upload-title">上传微信收款码</span>
              <span class="upload-hint">{{ qrFiles.wechat ? '已选择新图片，保存后会替换当前收款码' : (settings.payment_qrs.wechat ? '当前已配置收款码，可重新选择替换' : '支持 JPG、PNG，建议上传清晰方形二维码') }}</span>
              <span class="upload-filename">{{ qrFiles.wechat ? qrFiles.wechat.name : assetFileName(settings.payment_qrs.wechat, '暂未选择图片') }}</span>
            </span>
            <span class="upload-trigger">{{ qrFiles.wechat ? '重新选择' : '选择图片' }}</span>
          </label>
        </article>
        <article class="qr-card">
          <h3>支付宝收款码</h3>
          <div class="qr-preview" @click="settings.payment_qrs.alipay && previewImage(settings.payment_qrs.alipay)">
            <img v-if="settings.payment_qrs.alipay" :src="encodedImage(settings.payment_qrs.alipay)" alt="支付宝收款码">
            <div v-else class="qr-empty">暂未上传</div>
          </div>
          <label class="upload-field" :class="{ 'has-file': qrFiles.alipay || settings.payment_qrs.alipay }">
            <input class="upload-input" type="file" accept="image/*" @change="onQrFileChange($event, 'alipay')">
            <span class="upload-meta">
              <span class="upload-title">上传支付宝收款码</span>
              <span class="upload-hint">{{ qrFiles.alipay ? '已选择新图片，保存后会替换当前收款码' : (settings.payment_qrs.alipay ? '当前已配置收款码，可重新选择替换' : '支持 JPG、PNG，建议上传清晰方形二维码') }}</span>
              <span class="upload-filename">{{ qrFiles.alipay ? qrFiles.alipay.name : assetFileName(settings.payment_qrs.alipay, '暂未选择图片') }}</span>
            </span>
            <span class="upload-trigger">{{ qrFiles.alipay ? '重新选择' : '选择图片' }}</span>
          </label>
        </article>
      </div>
      <div class="card-actions">
        <button class="outline-btn" :disabled="savingStates.uploadPaymentQrs || (!qrFiles.wechat && !qrFiles.alipay)" @click="uploadPaymentQrs">{{ savingStates.uploadPaymentQrs ? '上传中...' : '上传收款码' }}</button>
        <button class="solid-btn" :disabled="savingStates.settings || !isAdminSettingsDirty" @click="saveSettings">{{ savingStates.settings ? '保存中...' : '保存店铺设置' }}</button>
      </div>
      <section class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>账号安全</h3>
            <p class="section-desc">后台入口仅管理员可见，可在这里修改管理员账号和登录密码。</p>
          </div>
        </div>
        <div class="admin-form-grid">
          <input v-model.trim="adminAccountForm.username" class="input" placeholder="管理员账号">
          <input v-model.trim="adminAccountForm.current_password" type="password" class="input" placeholder="当前密码">
          <input v-model.trim="adminAccountForm.new_password" type="password" class="input" placeholder="新密码，不修改可留空">
          <input v-model.trim="adminAccountForm.confirm_password" type="password" class="input" placeholder="确认新密码">
        </div>
        <div class="card-actions">
          <button class="solid-btn" :disabled="savingStates.account || !isAdminAccountDirty" @click="saveAdminAccount">{{ savingStates.account ? '保存中...' : '保存账号安全设置' }}</button>
        </div>
      </section>
    </section>
  </div>

  <div class="page-shell admin-shell" v-else>
    <header class="admin-hero">
      <div>
        <p class="section-kicker">后台入口</p>
        <h1>管理员登录后可见</h1>
        <p class="section-desc">后台入口已与前台分离。请使用管理员账号和密码登录后进入套餐、设备、订单和店铺设置管理。</p>
      </div>
      <div class="hero-actions">
        <button class="solid-btn" @click="showLoginModal = true">管理员登录</button>
        <button class="outline-btn" @click="goStorefront">返回前台</button>
      </div>
    </header>
    <section class="admin-panel">
      <div class="empty-box">当前未登录管理员账号，或当前账号没有后台权限。</div>
    </section>
  </div>
</template>`;

    const modalTemplate = `
<div v-if="showLoginModal" class="overlay" @click.self="showLoginModal = false">
  <div class="modal-card compact">
    <div class="modal-head">
      <div>
        <h3>{{ isAdminEntry ? '管理员登录' : '手机号登录' }}</h3>
        <p class="muted-copy">{{ isAdminEntry ? '请输入后台管理员账号和密码，前台用户无法看到后台内容。' : '输入中国大陆手机号即可登录，下单和查看订单前需要先登录。' }}</p>
      </div>
      <button class="icon-btn" @click="showLoginModal = false">×</button>
    </div>
    <div class="modal-body">
      <template v-if="isAdminEntry">
        <input v-model.trim="adminUsername" class="input" placeholder="请输入管理员账号" @keyup.enter="login">
        <input v-model.trim="adminPassword" type="password" class="input" placeholder="请输入管理员密码" @keyup.enter="login">
      </template>
      <input v-else v-model.trim="loginPhone" maxlength="11" class="input" placeholder="请输入 11 位手机号" @keyup.enter="login">
      <button class="solid-btn wide-btn" :disabled="savingStates.login" @click="login">{{ savingStates.login ? '登录中...' : '立即登录' }}</button>
    </div>
  </div>
</div>

<div v-if="showBuilder" class="overlay" @click.self="closeBuilder">
  <div class="modal-card wide">
    <div class="modal-head">
      <div>
        <h3>{{ builderForm.flow_type === 'buy_device' ? '购买设备配卡下单' : '寄设备配卡下单' }}</h3>
        <p class="muted-copy">购买设备配卡支持先选设备再配套餐，寄设备配卡则先选套餐。两种方式都需要上传付款截图。</p>
      </div>
      <button class="icon-btn" @click="closeBuilder">×</button>
    </div>
    <div class="modal-body builder-layout">
      <div class="builder-main">
        <div class="flow-switch">
          <button class="tab-btn" :class="{ active: builderForm.flow_type === 'buy_device' }" @click="setBuilderFlow('buy_device')">购买设备配卡</button>
          <button class="tab-btn" :class="{ active: builderForm.flow_type === 'ship_device' }" @click="setBuilderFlow('ship_device')">寄设备配卡</button>
        </div>
        <div class="builder-mobile-summary">
          <span>{{ flowTypeText(builderForm.flow_type) }}</span>
          <strong>{{ selectedPlan ? selectedPlan.name : '请先选择套餐' }}</strong>
          <p v-if="builderForm.flow_type === 'buy_device'">{{ selectedDevice ? selectedDevice.name + ' × ' + builderForm.quantity : '请先选择设备' }}</p>
          <p v-else>填写设备信息并上传付款截图后即可提交审核</p>
        </div>

        <section v-if="builderForm.flow_type === 'ship_device'" class="builder-section">
          <div class="builder-title"><h4>1. 选择套餐</h4><span>必选</span></div>
          <div class="builder-choice-grid">
            <button v-for="plan in plans" :key="plan.id" class="choice-card" :class="{ selected: builderForm.plan_id === plan.id }" @click="builderForm.plan_id = plan.id">
              <div class="choice-media"><img :src="planImage(plan)" :alt="plan.name"></div>
              <strong>{{ plan.name }}</strong>
              <span>{{ plan.monthly_data || '以图片说明为准' }}</span>
              <span>{{ plan.setup_price > 0 ? '配卡费 ' + currency(plan.setup_price) : '资费以图片为准' }}</span>
            </button>
          </div>
        </section>
        <section v-if="builderForm.flow_type === 'buy_device'" class="builder-section">
          <div class="builder-title"><h4>1. 先选择设备</h4><span>必选</span></div>
          <div class="builder-choice-grid">
            <button v-for="device in devices" :key="device.id" class="choice-card" :class="{ selected: builderForm.device_id === device.id }" @click="chooseDevice(device.id)" :disabled="device.stock <= 0">
              <div class="choice-media"><img :src="deviceImage(device)" :alt="device.name"></div>
              <strong>{{ device.name }}</strong>
              <span>{{ device.model }} / {{ deviceCategoryText(device.category) }}</span>
              <span>{{ deviceCompatibilityText(device) }}</span>
              <span>{{ device.stock > 0 ? currency(device.price) : '暂时缺货' }}</span>
            </button>
          </div>
          <div class="quantity-row">
            <span>购买数量</span>
            <div class="counter">
              <button class="counter-btn" @click="changeQuantity(-1)">-</button>
              <strong>{{ builderForm.quantity }}</strong>
              <button class="counter-btn" @click="changeQuantity(1)">+</button>
            </div>
          </div>
        </section>
        <section v-if="builderForm.flow_type === 'buy_device'" class="builder-section">
          <div class="builder-title"><h4>2. 再选择可配套餐</h4><span>按设备自动筛选</span></div>
          <div v-if="availablePlansForBuilder.length" class="builder-choice-grid">
            <button v-for="plan in availablePlansForBuilder" :key="plan.id" class="choice-card" :class="{ selected: builderForm.plan_id === plan.id }" @click="builderForm.plan_id = plan.id">
              <div class="choice-media"><img :src="planImage(plan)" :alt="plan.name"></div>
              <strong>{{ plan.name }}</strong>
              <span>{{ plan.monthly_data || '以图片说明为准' }}</span>
              <span>{{ plan.setup_price > 0 ? '配卡费 ' + currency(plan.setup_price) : '资费以图片为准' }}</span>
            </button>
          </div>
          <div v-else class="empty-box compact-empty">这台设备暂时没有可搭配的上架套餐，请更换设备或联系客服处理。</div>
        </section>

        <section class="builder-section">
          <div class="builder-title"><h4>{{ builderForm.flow_type === 'buy_device' ? '3. 联系人与收货信息' : '3. 联系人与回寄信息' }}</h4><span>必填</span></div>
          <div class="admin-form-grid">
            <input v-model.trim="builderForm.customer_name" class="input" placeholder="联系人姓名">
            <input v-model.trim="builderForm.customer_phone" class="input" placeholder="手机号码">
            <textarea v-model.trim="builderForm.shipping_address" class="input full-span" rows="3" :placeholder="builderForm.flow_type === 'buy_device' ? '收货地址' : '回寄地址'"></textarea>
            <textarea v-model.trim="builderForm.remark" class="input full-span" rows="3" placeholder="备注说明（可选）"></textarea>
          </div>
        </section>

        <section v-if="builderForm.flow_type === 'ship_device'" class="builder-section">
          <div class="builder-title"><h4>4. 填写寄送设备信息</h4><span>必填</span></div>
          <div class="warning-strip danger-lite">
            <strong>寄设备配卡提醒</strong>
            <p>设备卡槽必须提前打胶，由我们这边到件后负责打胶处理，请在备注中写清楚，避免影响后续配卡进度。</p>
          </div>
          <div class="admin-form-grid">
            <input v-model.trim="builderForm.customer_device_brand" class="input" placeholder="设备品牌">
            <input v-model.trim="builderForm.customer_device_model" class="input" placeholder="设备型号">
            <div class="choice-pill-group full-span">
              <span class="field-label">设备是否可插卡</span>
              <div class="pill-choice-row">
                <button type="button" class="pill-choice" :class="{ active: builderForm.customer_device_can_insert_card === 'yes' }" @click="builderForm.customer_device_can_insert_card = 'yes'">可以插卡</button>
                <button type="button" class="pill-choice" :class="{ active: builderForm.customer_device_can_insert_card === 'no' }" @click="builderForm.customer_device_can_insert_card = 'no'">不可插卡</button>
                <button type="button" class="pill-choice" :class="{ active: builderForm.customer_device_can_insert_card === 'unknown' }" @click="builderForm.customer_device_can_insert_card = 'unknown'">不清楚</button>
              </div>
            </div>
            <div class="choice-pill-group full-span">
              <span class="field-label">设备是否已去控</span>
              <div class="pill-choice-row">
                <button type="button" class="pill-choice" :class="{ active: builderForm.customer_device_remove_control === 'yes' }" @click="builderForm.customer_device_remove_control = 'yes'">已去控</button>
                <button type="button" class="pill-choice" :class="{ active: builderForm.customer_device_remove_control === 'no' }" @click="builderForm.customer_device_remove_control = 'no'">未去控</button>
                <button type="button" class="pill-choice" :class="{ active: builderForm.customer_device_remove_control === 'unknown' }" @click="builderForm.customer_device_remove_control = 'unknown'">不清楚</button>
              </div>
            </div>
            <input v-model.trim="builderForm.customer_device_tracking" class="input full-span" placeholder="你寄给商家的快递单号">
            <textarea v-model.trim="builderForm.customer_device_condition" class="input full-span" rows="3" placeholder="设备当前情况，例如是否能开机、是否能联网、是否需要刷机等"></textarea>
            <textarea v-model.trim="builderForm.customer_device_notes" class="input full-span" rows="3" placeholder="其他补充说明（可选）"></textarea>
          </div>
          <div v-if="shopReceivingText" class="address-card">
            <div>
              <span>商家收件地址</span>
              <strong>{{ settings.shop_receiving_name || '收件人' }}</strong>
              <p>{{ shopReceivingText }}</p>
            </div>
            <button class="outline-btn small" @click="copyText(shopReceivingText, '收件地址已复制')">复制寄送地址</button>
          </div>
        </section>
      </div>

      <aside class="builder-side">
        <section class="summary-card">
          <div class="builder-title"><h4>订单确认</h4><span>实时计算</span></div>
          <div class="summary-row"><span>下单方式</span><strong>{{ flowTypeText(builderForm.flow_type) }}</strong></div>
          <div class="summary-row"><span>所选套餐</span><strong>{{ selectedPlan ? selectedPlan.name : '请先选择套餐' }}</strong></div>
          <div class="summary-row" v-if="builderForm.flow_type === 'buy_device'"><span>所选设备</span><strong>{{ selectedDevice ? selectedDevice.name + ' × ' + builderForm.quantity : '请先选择设备' }}</strong></div>
          <div class="summary-row"><span>套餐配卡费</span><strong>{{ currency(selectedPlan ? selectedPlan.setup_price : 0) }}</strong></div>
          <div class="summary-row" v-if="builderForm.flow_type === 'buy_device'"><span>设备金额</span><strong>{{ currency(builderForm.flow_type === 'buy_device' && selectedDevice ? selectedDevice.price * builderForm.quantity : 0) }}</strong></div>
          <div class="summary-row" v-if="builderForm.flow_type === 'ship_device'"><span>{{ settings.ship_service_title || '寄设备配卡服务费' }}</span><strong>{{ currency(settings.ship_service_fee || 0) }}</strong></div>
          <div class="summary-row total"><span>应付合计</span><strong>{{ currency(orderTotal) }}</strong></div>
        </section>

        <section class="summary-card">
          <div class="builder-title"><h4>扫码付款</h4><span>必填</span></div>
          <div class="warning-strip">
            <strong>付款后请马上上传截图</strong>
            <p>没有付款截图的订单不会进入人工审核，也不会开始配卡和发货。</p>
          </div>
          <div class="payment-switch">
            <button class="tab-btn" :class="{ active: builderForm.payment_method === 'wechat' }" @click="builderForm.payment_method = 'wechat'">微信付款</button>
            <button class="tab-btn" :class="{ active: builderForm.payment_method === 'alipay' }" @click="builderForm.payment_method = 'alipay'">支付宝付款</button>
          </div>
          <div class="qr-preview large" @click="activePaymentQr && previewImage(activePaymentQr)">
            <img v-if="activePaymentQr" :src="encodedImage(activePaymentQr)" :alt="paymentText(builderForm.payment_method)">
            <div v-else class="qr-empty">商家暂未配置对应收款码</div>
          </div>
          <p class="muted-copy">{{ settings.payment_notice }}</p>
          <div v-if="settings.service_wechat" class="contact-strip">
            <div class="contact-strip-copy">
              <span>客服微信</span>
              <strong>{{ settings.service_wechat }}</strong>
              <p>付款后可复制微信联系确认，便于尽快审核订单。</p>
            </div>
            <div class="contact-actions">
              <button class="outline-btn small" @click="copyText(settings.service_wechat, '客服微信已复制')">复制客服微信</button>
              <a v-if="settings.service_phone" class="outline-btn small" :href="'tel:' + settings.service_phone">拨打客服</a>
            </div>
          </div>
          <label class="upload-field" :class="{ 'has-file': paymentProofFile }">
            <input class="upload-input" type="file" accept="image/*" @change="onPaymentProofChange">
            <span class="upload-meta">
              <span class="upload-title">上传付款截图</span>
              <span class="upload-hint">{{ paymentProofFile ? '付款截图已选中，提交订单时会一并上传' : '付款完成后上传截图，支持微信或支付宝付款凭证' }}</span>
              <span class="upload-filename">{{ paymentProofFile ? paymentProofFile.name : '暂未选择截图' }}</span>
            </span>
            <span class="upload-trigger">{{ paymentProofFile ? '重新选择' : '选择截图' }}</span>
          </label>
          <img v-if="paymentProofPreview" :src="paymentProofPreview" class="proof-preview" alt="付款截图预览">
          <button class="solid-btn wide-btn" :disabled="savingStates.submitOrder" @click="submitOrder">{{ savingStates.submitOrder ? '提交中...' : '提交订单并上传付款截图' }}</button>
        </section>
      </aside>
      <div class="builder-submit-bar">
        <div class="builder-submit-copy">
          <span>应付合计</span>
          <strong>{{ currency(orderTotal) }}</strong>
          <p>手机端可直接在底部提交订单</p>
        </div>
        <button class="solid-btn" :disabled="savingStates.submitOrder" @click="submitOrder">{{ savingStates.submitOrder ? '提交中...' : '立即提交' }}</button>
      </div>
    </div>
  </div>
</div>

<div v-if="showOrdersModal" class="overlay" @click.self="showOrdersModal = false">
  <div class="modal-card wide">
    <div class="modal-head">
      <div>
        <h3>我的订单</h3>
        <p class="muted-copy">这里可以查看订单进度、付款截图、商家回寄单号，并在允许时取消或确认收货。</p>
      </div>
      <button class="icon-btn" @click="showOrdersModal = false">×</button>
    </div>
    <div class="modal-body">
      <div v-if="myOrders.length" class="order-list">
        <article v-for="order in myOrders" :key="order.id" class="order-card">
          <div class="order-topline">
            <div>
              <div class="copy-inline">
                <strong>{{ order.order_no }}</strong>
                <button class="outline-btn small" @click="copyText(order.order_no, '订单号已复制')">复制订单号</button>
              </div>
              <p class="muted-copy">{{ formatDateTime(order.created_at) }} / {{ flowTypeText(order.flow_type) }}</p>
            </div>
            <span class="status-pill" :class="order.status">{{ orderStatusText(order.status) }}</span>
          </div>
          <div class="timeline-strip">
            <div v-for="step in orderTimeline(order)" :key="step.key" class="timeline-step" :class="step.state">
              <span>{{ step.label }}</span>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-card"><span>订单内容</span><strong>{{ order.summary_text }}</strong><p>总金额 {{ currency(order.total_amount) }}</p></div>
            <div class="detail-card"><span>收货 / 回寄地址</span><strong>{{ order.shipping_address }}</strong><p>{{ order.remark || '无备注' }}</p></div>
            <div class="detail-card"><span>付款方式</span><strong>{{ paymentText(order.payment_method) }}</strong><button v-if="order.payment_proof" class="outline-btn small" @click="previewImage(order.payment_proof)">查看付款截图</button></div>
            <div class="detail-card">
              <span>商家回寄</span>
              <strong>{{ order.logistics_company || '待填写' }}</strong>
              <p>{{ order.merchant_tracking_number || '暂未出单号' }}</p>
              <button v-if="order.merchant_tracking_number" class="outline-btn small" @click="copyText(order.merchant_tracking_number, '快递单号已复制')">复制快递单号</button>
            </div>
          </div>
          <div v-if="allowPaymentProofRefresh(order)" class="reupload-proof">
            <label class="upload-field" :class="{ 'has-file': orderProofFiles[order.id] }">
              <input class="upload-input" type="file" accept="image/*" @change="onOrderProofChange($event, order.id)">
              <span class="upload-meta">
                <span class="upload-title">补传付款截图</span>
                <span class="upload-hint">{{ orderProofFiles[order.id] ? '已选择新的截图，提交后会替换原付款凭证' : '如果原图不清晰或漏传，可以在这里重新上传' }}</span>
                <span class="upload-filename">{{ orderProofFiles[order.id] ? orderProofFiles[order.id].name : '暂未选择新截图' }}</span>
              </span>
              <span class="upload-trigger">{{ orderProofFiles[order.id] ? '重新选择' : '选择截图' }}</span>
            </label>
            <button class="outline-btn small" :disabled="!orderProofFiles[order.id]" @click="reuploadOrderPaymentProof(order)">提交新截图</button>
          </div>
          <div v-if="settings.service_wechat || settings.service_phone" class="card-actions compact-actions">
            <button v-if="settings.service_wechat" class="outline-btn small" @click="copyText(settings.service_wechat, '客服微信已复制')">联系客服微信</button>
            <a v-if="settings.service_phone" class="outline-btn small" :href="'tel:' + settings.service_phone">拨打客服</a>
            <button class="outline-btn small" @click="toastMessage(settings.aftersales_notice || '售后说明已在首页展示')">售后说明</button>
          </div>
          <div class="card-actions">
            <button v-if="order.can_cancel" class="outline-btn" @click="cancelOrder(order)">取消订单</button>
            <button v-if="order.can_confirm" class="solid-btn" @click="confirmOrder(order)">确认收货</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-box">你还没有订单，先去选套餐和设备吧。</div>
    </div>
  </div>
</div>
<div v-if="showPlanEditor" class="overlay" @click.self="closePlanEditor">
  <div class="modal-card wide">
    <div class="modal-head">
      <div>
        <h3>{{ planEditorForm.id ? '编辑套餐' : '新增套餐' }}</h3>
        <p class="muted-copy">套餐图是前台最重要的信息载体，请尽量上传清晰的资费图。</p>
      </div>
      <button class="icon-btn" @click="closePlanEditor">×</button>
    </div>
    <div class="modal-body">
      <div class="editor-layout">
        <div class="editor-preview">
          <div class="editor-image" @click="previewImage(planEditorPreview || placeholder('套餐图片', '#0E6D68', '#51A7A3'))">
            <img :src="planEditorPreview || placeholder('套餐图片', '#0E6D68', '#51A7A3')" alt="套餐预览">
          </div>
          <label class="upload-field" :class="{ 'has-file': planImageFile || planEditorPreview }">
            <input class="upload-input" type="file" accept="image/*" @change="onPlanImageChange">
            <span class="upload-meta">
              <span class="upload-title">上传套餐展示图</span>
              <span class="upload-hint">{{ planImageFile ? '已选择新图片，保存后会替换当前套餐图' : (planEditorPreview ? '当前正在使用已有套餐图，可重新选择替换' : '建议上传清晰完整的资费图片，前台会按比例完整展示') }}</span>
              <span class="upload-filename">{{ planImageFile ? planImageFile.name : (planEditorPreview ? '当前已有套餐图' : '暂未选择图片') }}</span>
            </span>
            <span class="upload-trigger">{{ planImageFile ? '重新选择' : '选择图片' }}</span>
          </label>
        </div>
        <div class="admin-form-grid grow">
          <input v-model.trim="planEditorForm.name" class="input" placeholder="套餐名称">
          <input v-model.trim="planEditorForm.badge" class="input" placeholder="角标文案">
          <input v-model.trim="planEditorForm.carrier" class="input" placeholder="运营商">
          <input v-model.trim="planEditorForm.network_type" class="input" placeholder="网络类型">
          <input v-model.trim="planEditorForm.monthly_data" class="input" placeholder="套餐流量">
          <input v-model.number="planEditorForm.monthly_price" type="number" min="0" class="input" placeholder="月费参考价">
          <input v-model.number="planEditorForm.setup_price" type="number" min="0" class="input" placeholder="配卡费">
          <input v-model.number="planEditorForm.hot_rank" type="number" min="0" class="input" placeholder="热销排序值">
          <input v-model.number="planEditorForm.sort_order" type="number" min="1" class="input" placeholder="排序">
          <input v-model.trim="planEditorForm.best_for" class="input full-span" placeholder="适用场景">
          <input v-model.trim="planEditorForm.coverage" class="input full-span" placeholder="覆盖说明">
          <input v-model.trim="planEditorForm.purchase_note" class="input full-span" placeholder="购买提示">
          <textarea v-model.trim="planEditorForm.features_text" class="input full-span" rows="4" placeholder="卖点说明，一行一条"></textarea>
          <textarea v-model.trim="planEditorForm.tags_text" class="input full-span" rows="2" placeholder="标签，换行或逗号分隔"></textarea>
          <textarea v-model.trim="planEditorForm.description" class="input full-span" rows="4" placeholder="补充介绍"></textarea>
          <select v-model="planEditorForm.status" class="input"><option value="active">上架</option><option value="inactive">下架</option></select>
          <label class="switch-line"><input type="checkbox" v-model="planEditorForm.featured"><span>首页重点展示</span></label>
        </div>
      </div>
      <div class="card-actions"><button class="outline-btn" @click="closePlanEditor">取消</button><button class="solid-btn" :disabled="savingStates.plan || !isPlanEditorDirty" @click="savePlan">{{ savingStates.plan ? '保存中...' : '保存套餐' }}</button></div>
    </div>
  </div>
</div>

<div v-if="showDeviceEditor" class="overlay" @click.self="closeDeviceEditor">
  <div class="modal-card wide">
    <div class="modal-head">
      <div>
        <h3>{{ deviceEditorForm.id ? '编辑设备' : '新增设备' }}</h3>
        <p class="muted-copy">上传设备主图、补充设备卖点和库存，前台会自动同步成设备图文卡片。</p>
      </div>
      <button class="icon-btn" @click="closeDeviceEditor">×</button>
    </div>
    <div class="modal-body">
      <div class="editor-layout">
        <div class="editor-preview">
          <div class="editor-image" @click="previewImage(deviceEditorPreview || placeholder('设备图片', '#183D68', '#E7A23D'))">
            <img :src="deviceEditorPreview || placeholder('设备图片', '#183D68', '#E7A23D')" alt="设备预览">
          </div>
          <label class="upload-field" :class="{ 'has-file': deviceImageFile || deviceEditorPreview }">
            <input class="upload-input" type="file" accept="image/*" @change="onDeviceImageChange">
            <span class="upload-meta">
              <span class="upload-title">上传设备展示图</span>
              <span class="upload-hint">{{ deviceImageFile ? '已选择新图片，保存后会替换当前设备图' : (deviceEditorPreview ? '当前正在使用已有设备图，可重新选择替换' : '建议上传白底或清晰主图，便于手机端完整展示') }}</span>
              <span class="upload-filename">{{ deviceImageFile ? deviceImageFile.name : (deviceEditorPreview ? '当前已有设备图' : '暂未选择图片') }}</span>
            </span>
            <span class="upload-trigger">{{ deviceImageFile ? '重新选择' : '选择图片' }}</span>
          </label>
        </div>
        <div class="admin-form-grid grow">
          <input v-model.trim="deviceEditorForm.name" class="input" placeholder="设备名称">
          <input v-model.trim="deviceEditorForm.model" class="input" placeholder="设备型号">
          <select v-model="deviceEditorForm.category" class="input">
            <option value="portable_wifi">随身 WiFi</option>
            <option value="cpe">CPE 设备</option>
            <option value="vehicle_router">车载路由</option>
            <option value="industrial_gateway">工业网关</option>
          </select>
          <input v-model.trim="deviceEditorForm.network_type" class="input" placeholder="网络类型">
          <input v-model.number="deviceEditorForm.price" type="number" min="0" class="input" placeholder="销售价">
          <input v-model.number="deviceEditorForm.original_price" type="number" min="0" class="input" placeholder="划线价">
          <input v-model.number="deviceEditorForm.stock" type="number" min="0" class="input" placeholder="库存">
          <input v-model.number="deviceEditorForm.hot_rank" type="number" min="0" class="input" placeholder="热销排序值">
          <input v-model.number="deviceEditorForm.sort_order" type="number" min="1" class="input" placeholder="排序">
          <input v-model.trim="deviceEditorForm.badge" class="input" placeholder="角标文案">
          <input v-model.trim="deviceEditorForm.short_description" class="input full-span" placeholder="简短介绍">
          <textarea v-model.trim="deviceEditorForm.features_text" class="input full-span" rows="4" placeholder="设备卖点，一行一条"></textarea>
          <textarea v-model.trim="deviceEditorForm.tags_text" class="input full-span" rows="2" placeholder="标签，换行或逗号分隔"></textarea>
          <div class="compatibility-editor full-span">
            <div class="builder-title compact-title">
              <h4>可配套餐限制</h4>
              <span>不勾选表示全部可配</span>
            </div>
            <div class="compatibility-grid">
              <label v-for="plan in adminPlans" :key="plan.id" class="compatibility-item">
                <input v-model="deviceEditorForm.compatible_plan_ids" type="checkbox" :value="plan.id">
                <span>{{ plan.name }}</span>
              </label>
            </div>
          </div>
          <textarea v-model.trim="deviceEditorForm.description" class="input full-span" rows="4" placeholder="详细介绍"></textarea>
          <select v-model="deviceEditorForm.status" class="input"><option value="active">上架</option><option value="inactive">下架</option></select>
          <label class="switch-line"><input type="checkbox" v-model="deviceEditorForm.featured"><span>首页重点展示</span></label>
        </div>
      </div>
      <div class="card-actions"><button class="outline-btn" @click="closeDeviceEditor">取消</button><button class="solid-btn" :disabled="savingStates.device || !isDeviceEditorDirty" @click="saveDevice">{{ savingStates.device ? '保存中...' : '保存设备' }}</button></div>
    </div>
  </div>
</div>

<div v-if="previewImageUrl" class="overlay image-overlay" @click="previewImageUrl = null">
  <img :src="previewImageUrl" class="preview-image" alt="预览图片" @error="handlePreviewImageError">
</div>

<div class="toast" :class="{ show: toast.show }">{{ toast.message }}</div>`;

    return { storefrontTemplate, adminTemplate, modalTemplate };
})();
