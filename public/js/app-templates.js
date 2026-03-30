window.AppTemplates = (() => {
    const storefrontTemplate = `
<template v-if="!isAdminEntry">
  <div class="page-shell">
    <header class="hero-card" :class="{ 'hero-card-mobile': isCompactMobile }">
      <div class="hero-topbar">
        <div class="hero-brand-block">
          <div class="brand-line">
            <span class="brand-name">{{ settings.store_name }}</span>
          </div>
          <p class="brand-desc">{{ isCompactMobile ? '先看套餐图，再选下单方式，付款截图审核后安排配卡与发货。' : settings.hero_badge }}</p>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" @click="openOrders">{{ isCompactMobile ? '查订单' : '我的订单' }}</button>
          <button class="ghost-btn" @click="scrollToSection('plans')">{{ isCompactMobile ? '看套餐' : '先看套餐' }}</button>
          <button v-if="!isCompactMobile" class="ghost-btn" @click="openBuilder('buy_device')">立即下单</button>
          <button v-if="currentUser" class="solid-btn alt" @click="logout">{{ isCompactMobile ? '退出' : '退出登录' }}</button>
          <button v-else class="solid-btn" @click="showLoginModal = true">{{ isCompactMobile ? '登录' : '手机号登录' }}</button>
        </div>
      </div>

      <div class="hero-layout">
        <section class="hero-copy">
          <p class="hero-kicker">物联卡不单卖，只做设备配卡与寄设备配卡</p>
          <h1>{{ settings.hero_title }}</h1>
          <p class="hero-summary">{{ isCompactMobile ? '先看套餐资费图，再选购买设备配卡或寄设备配卡，付款后上传截图等待审核。' : settings.hero_subtitle }}</p>
          <div class="hero-cta" :class="{ 'hero-cta-mobile': isCompactMobile }">
            <button class="solid-btn large" @click="scrollToSection('plans')">{{ isCompactMobile ? '先看套餐资费图' : '先看资费图片' }}</button>
            <button class="outline-btn light" @click="openBuilder('buy_device')">{{ isCompactMobile ? '买设备配卡' : '购买设备配卡' }}</button>
            <button class="outline-btn light" @click="openBuilder('ship_device')">{{ isCompactMobile ? '寄设备配卡' : '寄设备来配卡' }}</button>
          </div>
          <div v-if="isCompactMobile" class="hero-mobile-points">
            <span class="hero-mobile-point">1. 先选运营商和套餐</span>
            <span class="hero-mobile-point">2. 再选购买设备或寄设备</span>
            <span class="hero-mobile-point">3. 付款后上传截图等审核</span>
          </div>
          <div v-else class="hero-tags">
            <span class="tag-chip">先看套餐图</span>
            <span class="tag-chip">再选下单路径</span>
            <span class="tag-chip">扫码付款后上传截图</span>
            <span class="tag-chip">人工审核后发货或回寄</span>
          </div>
          <div v-if="!isCompactMobile" class="trust-strip">
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
        <aside v-if="!isCompactMobile" class="hero-side">
          <article class="hero-metric">
            <span>当前套餐</span>
            <strong>{{ plans.length }}</strong>
            <p>套餐内容以图片为主展示，文字只做补充说明。</p>
          </article>
          <article class="hero-metric accent">
            <span>现货设备</span>
            <strong>{{ devices.length }}</strong>
            <p>支持随身 WiFi、4G/5G CPE 等设备选购配卡。</p>
          </article>
          <article class="hero-metric warm">
            <span>收款方式</span>
            <strong>微信 / 支付宝</strong>
            <p>下单后扫码付款，并上传付款截图等待人工审核。</p>
          </article>
        </aside>
      </div>
    </header>

    <section v-if="isCompactMobile" class="section-card mobile-quick-panel">
      <div class="section-head compact-head mobile-quick-head">
        <div>
          <p class="section-kicker">手机端快捷入口</p>
          <h2>直接按这几个入口操作就行</h2>
          <p class="section-desc">首页只保留核心路径，先看套餐，再决定买设备配卡还是寄设备配卡。</p>
        </div>
      </div>
      <div class="mobile-quick-grid">
        <button class="mobile-quick-btn" @click="scrollToSection('plans')">
          <strong>先看套餐</strong>
          <span>按移动 / 联通 / 电信 / 广电分类切换</span>
        </button>
        <button class="mobile-quick-btn" @click="openBuilder('buy_device', storefrontSelectedPlan ? { planId: storefrontSelectedPlan.id } : {})">
          <strong>购买设备配卡</strong>
          <span>没有设备，直接买设备和套餐</span>
        </button>
        <button class="mobile-quick-btn" @click="openBuilder('ship_device', storefrontSelectedPlan ? { planId: storefrontSelectedPlan.id } : {})">
          <strong>寄设备配卡</strong>
          <span>已有设备，填写信息后寄过来处理</span>
        </button>
        <button class="mobile-quick-btn accent" @click="openOrders">
          <strong>我的订单</strong>
          <span>查看审核、发货、物流和提醒</span>
        </button>
      </div>
      <div class="compact-steps-row mobile-simple-steps">
        <span class="compact-step-chip">先看套餐图</span>
        <span class="compact-step-chip">再选下单方式</span>
        <span class="compact-step-chip">最后上传付款截图</span>
      </div>
    </section>

    <section v-else class="section-card intro-card">
      <div class="section-head">
        <div>
          <p class="section-kicker">新手下单</p>
          <h2>手机端三步完成下单</h2>
          <p class="section-desc">绝大多数用户都是手机访问，所以首页直接把最核心的 3 步说明清楚，避免来回问答。</p>
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
        <button class="outline-btn" @click="openBuilder('buy_device', storefrontSelectedPlan ? { planId: storefrontSelectedPlan.id } : {})">看完直接下单</button>
      </div>

      <div v-if="storefrontPlanCarrierOptions.length" class="builder-filter-strip storefront-plan-filter">
        <span class="builder-filter-label">套餐分类</span>
        <div class="pill-choice-row builder-carrier-row">
          <button
            v-for="option in storefrontPlanCarrierOptions"
            :key="'storefront-carrier-' + option.code"
            type="button"
            class="pill-choice builder-carrier-pill"
            :class="{ active: storefrontPlanCarrierFilter === option.code }"
            :disabled="option.disabled"
            @click="setStorefrontPlanCarrierFilter(option.code)"
          >
            <span>{{ option.label }}</span>
            <em>{{ option.count }}</em>
          </button>
        </div>
      </div>

      <div v-if="isCompactMobile && storefrontSelectedPlan" class="mobile-selected-plan-strip">
        <span>当前已选</span>
        <strong>{{ storefrontSelectedPlan.name }}</strong>
        <p>{{ normalizePlanCarrier(storefrontSelectedPlan.carrier) }} / {{ storefrontSelectedPlan.network_type || '4G/5G' }}，点大图可放大查看资费。</p>
      </div>

      <div v-if="filteredStorefrontPlans.length" class="plan-quick-grid">
        <button v-for="(plan, index) in filteredStorefrontPlans" :key="plan.id" class="plan-quick-card" :class="{ active: storefrontSelectedPlan && storefrontSelectedPlan.id === plan.id }" @click="selectStorefrontPlan(plan)">
          <div class="plan-quick-media" @dblclick.stop.prevent="previewImage(planImage(plan))" @touchend.stop.prevent="handleQuickPlanTouch(plan)">
            <img :src="planImage(plan)" :alt="plan.name" loading="lazy" decoding="async" fetchpriority="low">
            <span v-if="isHotPlan(plan, index)" class="spotlight-tag">热销套餐</span>
          </div>
          <div class="plan-quick-info">
            <span class="mini-badge">{{ plan.badge || plan.network_type || '套餐' }}</span>
            <strong>{{ plan.name }}</strong>
            <span>{{ normalizePlanCarrier(plan.carrier) }} / {{ plan.network_type || '4G/5G' }}</span>
            <span class="sales-copy">{{ planSalesText(plan, index) }}</span>
          </div>
        </button>
      </div>
      <article v-if="storefrontSelectedPlan" class="plan-focus-card">
        <div class="plan-visual spotlight" @click="previewImage(planImage(storefrontSelectedPlan))">
          <img :src="planImage(storefrontSelectedPlan)" :alt="storefrontSelectedPlan.name" loading="eager" decoding="async" fetchpriority="high">
          <div class="zoom-tip">点击查看大图</div>
        </div>
        <div class="plan-content">
          <div class="card-headline">
            <div>
              <span class="mini-badge">{{ storefrontSelectedPlan.badge || storefrontSelectedPlan.network_type || '套餐方案' }}</span>
              <h3>{{ storefrontSelectedPlan.name }}</h3>
            </div>
            <div class="price-box">
              <strong>{{ storefrontSelectedPlan.monthly_price > 0 ? currency(storefrontSelectedPlan.monthly_price) : '以图为准' }}</strong>
              <span>{{ storefrontSelectedPlan.monthly_price > 0 ? '/ 月参考价' : '资费以图片为准' }}</span>
            </div>
          </div>
          <div class="info-grid">
            <div><span>套餐流量</span><strong>{{ storefrontSelectedPlan.monthly_data || '以图片说明为准' }}</strong></div>
            <div><span>配卡服务</span><strong>{{ storefrontSelectedPlan.setup_price > 0 ? currency(storefrontSelectedPlan.setup_price) : '咨询客服' }}</strong></div>
            <div><span>网络类型</span><strong>{{ storefrontSelectedPlan.network_type || '4G/5G' }}</strong></div>
            <div><span>运营商</span><strong>{{ normalizePlanCarrier(storefrontSelectedPlan.carrier) }}</strong></div>
          </div>
          <p class="body-copy">{{ storefrontSelectedPlan.best_for || '适合根据设备场景灵活搭配' }}</p>
          <p class="muted-copy">套餐具体资费、速率、地区限制等都以图片内容为准。</p>
          <div class="sales-panel">
            <span class="spotlight-chip">{{ storefrontSelectedPlan.featured ? '当前热销套餐' : '热门搭配推荐' }}</span>
            <p>{{ planSalesText(storefrontSelectedPlan, filteredStorefrontPlans.findIndex(item => item.id === storefrontSelectedPlan.id)) }}</p>
          </div>
          <div class="pill-row">
            <span class="pill">{{ storefrontSelectedPlan.coverage || '全国大部分地区可用' }}</span>
            <span class="pill">{{ storefrontSelectedPlan.purchase_note || '不单独卖卡，只做设备配卡' }}</span>
            <span class="pill" v-for="tag in storefrontSelectedPlan.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
          </div>
          <ul v-if="storefrontSelectedPlan.features.length" class="feature-list">
            <li v-for="feature in storefrontSelectedPlan.features" :key="feature">{{ feature }}</li>
          </ul>
          <div class="card-actions">
            <button class="outline-btn" @click="openBuilder('ship_device', { planId: storefrontSelectedPlan.id })">寄设备配这个套餐</button>
            <button class="solid-btn" @click="openBuilder('buy_device', { planId: storefrontSelectedPlan.id })">购买设备配这个套餐</button>
          </div>
        </div>
      </article>
      <div v-if="isCompactMobile && storefrontSelectedPlan" class="mobile-plan-action-bar">
        <button class="outline-btn" @click="openBuilder('ship_device', { planId: storefrontSelectedPlan.id })">寄设备配这个套餐</button>
        <button class="solid-btn" @click="openBuilder('buy_device', { planId: storefrontSelectedPlan.id })">直接买设备配这个套餐</button>
      </div>
      <div v-if="!storefrontSelectedPlan" class="empty-box">{{ plans.length ? '当前分类下暂无上架套餐，请切换移动、联通、电信或广电分类查看。' : '暂时还没有上架套餐，请先补充套餐图片和说明。' }}</div>
    </section>

    <section class="section-card" id="flows">
      <div class="section-head">
        <div>
          <p class="section-kicker">第二步</p>
          <h2>选择你的下单方式</h2>
          <p class="section-desc">{{ isCompactMobile ? '买设备配卡或寄设备来配卡，按你当前情况选一个就行。' : '两条路径都要先确定套餐。区别在于，一条是直接购买设备配卡，另一条是用户自己寄设备过来配卡和测试。' }}</p>
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

    <section v-if="isCompactMobile && shopReceivingText" class="section-card mobile-ship-panel">
      <div class="section-head compact-head">
        <div>
          <p class="section-kicker">寄送地址</p>
          <h2>寄设备前先确认收件信息</h2>
          <p class="section-desc">寄设备配卡时，直接复制下面的寄送信息即可。</p>
        </div>
      </div>
      <div class="address-spotlight mobile-address-spotlight">
        <div>
          <strong>{{ settings.shop_receiving_name || '收件人未设置' }}</strong>
          <p class="body-copy">{{ shopReceivingText }}</p>
        </div>
        <button class="solid-btn" @click="copyText(shopReceivingText, '寄送地址已复制')">复制寄送地址</button>
      </div>
    </section>

    <section v-if="!isCompactMobile" class="section-card" id="hot-bundles">
      <div v-if="shopReceivingText" class="address-spotlight">
        <div>
          <p class="section-kicker">寄送地址</p>
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
          <p class="section-desc">{{ isCompactMobile ? '不想自己慢慢选的话，直接从常见组合里挑一个下单。' : '适合不想反复筛选的手机端用户，直接从常见组合里快速进入下单。' }}</p>
        </div>
      </div>
      <template v-if="visibleStorefrontBundles.length">
        <div class="bundle-grid">
          <article v-for="bundle in visibleStorefrontBundles" :key="bundle.key" class="bundle-card">
            <div class="bundle-cover">
              <div class="bundle-media">
                <img :src="deviceImage(bundle.device)" :alt="bundle.device.name" loading="lazy" decoding="async" fetchpriority="low">
              </div>
              <div class="bundle-media plan-side">
                <img :src="planImage(bundle.plan)" :alt="bundle.plan.name" loading="lazy" decoding="async" fetchpriority="low">
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
              <button class="solid-btn wide-btn" @click="openBuilder('buy_device', { deviceId: bundle.device.id, planId: bundle.plan.id })">直接下这单</button>
            </div>
          </article>
        </div>
        <div v-if="hasMoreStorefrontBundles || (isCompactMobile && featuredBundles.length > 2)" class="mobile-expand-row">
          <button class="outline-btn wide-btn" @click="toggleStorefrontBundleExpansion">{{ showAllStorefrontBundles ? '收起热门搭配' : ('展开全部热门搭配（' + featuredBundles.length + ' 个）') }}</button>
        </div>
      </template>
      <div v-else class="empty-box">当前还没有可用的热门搭配组合。</div>
    </section>

    <section class="section-card" id="devices">
      <div class="section-head">
        <div>
          <p class="section-kicker">第三步</p>
          <h2>设备选购</h2>
          <p class="section-desc">{{ isCompactMobile ? '只有“购买设备配卡”才需要选设备，寄设备配卡可以直接跳过这里。' : '如果用户选择购买设备配卡，就在这里继续选设备。设备和套餐会一起进入订单，不会出现单独卖卡的路径。' }}</p>
        </div>
      </div>
      <template v-if="visibleStorefrontDevices.length">
        <div class="device-grid">
          <article v-for="(device, index) in visibleStorefrontDevices" :key="device.id" class="device-card">
            <div class="device-cover" @click="previewImage(deviceImage(device))">
              <img :src="deviceImage(device)" :alt="device.name" loading="lazy" decoding="async" fetchpriority="low">
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
        <div v-if="hasMoreStorefrontDevices || (isCompactMobile && devices.length > 3)" class="mobile-expand-row">
          <button class="outline-btn wide-btn" @click="toggleStorefrontDeviceExpansion">{{ showAllStorefrontDevices ? '收起设备列表' : ('展开全部设备（' + devices.length + ' 台）') }}</button>
        </div>
      </template>
      <div v-else class="empty-box">暂时还没有设备上架，请先补充设备图片和介绍。</div>
    </section>

    <section v-if="!isCompactMobile" class="service-strip">
      <article class="service-card"><p class="section-kicker">付款说明</p><h3>暂不接官方支付接口</h3><p>{{ settings.payment_notice }}</p></article>
      <article class="service-card"><p class="section-kicker">寄送说明</p><h3>寄设备配卡需要补全设备信息</h3><p>{{ settings.shipping_notice }}</p></article>
      <article class="service-card"><p class="section-kicker">售后说明</p><h3>人工审核、测试、发货一体化</h3><p>{{ settings.aftersales_notice }}</p></article>
    </section>

    <section v-if="!isCompactMobile" class="section-card notes-grid">
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

    <section v-else class="section-card mobile-fold-stack">
      <details class="mobile-fold-card" open>
        <summary class="mobile-fold-summary">购买须知</summary>
        <div class="mobile-fold-body">
          <ul class="feature-list">
            <li v-for="item in settings.purchase_rules" :key="item">{{ item }}</li>
          </ul>
        </div>
      </details>
      <details class="mobile-fold-card">
        <summary class="mobile-fold-summary">寄设备前检查清单</summary>
        <div class="mobile-fold-body">
          <ul class="feature-list">
            <li v-for="item in settings.ship_checklist" :key="item">{{ item }}</li>
          </ul>
        </div>
      </details>
      <details class="mobile-fold-card">
        <summary class="mobile-fold-summary">审核与发货说明</summary>
        <div class="mobile-fold-body mobile-fold-copy">
          <p class="body-copy">{{ settings.delivery_notice }}</p>
          <p class="muted-copy">{{ settings.region_notice }}</p>
        </div>
      </details>
    </section>

    <section class="section-card faq-section">
      <div class="section-head">
        <div>
          <p class="section-kicker">常见问题</p>
          <h2>手机端下单前常问问题</h2>
          <p class="section-desc">把用户最常问的点提前说明清楚，能减少咨询、提高直接下单率。</p>
        </div>
      </div>
      <details v-if="isCompactMobile" class="mobile-fold-card">
        <summary class="mobile-fold-summary">展开常见问题</summary>
        <div class="faq-list mobile-fold-body">
          <article v-for="item in faqEntries" :key="item.question" class="faq-card">
            <strong>{{ item.question }}</strong>
            <p>{{ item.answer }}</p>
          </article>
        </div>
      </details>
      <div v-else class="faq-list">
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
      <button class="outline-btn" @click="openOrders">我的订单</button>
      <button class="solid-btn" @click="openBuilder('buy_device')">立即下单</button>
    </div>
  </div>
</template>`;

    const adminTemplate = `
<template v-else>
  <div class="page-shell admin-shell" v-if="isAdminView && isAdmin">
    <header class="admin-hero">
      <div class="admin-hero-copy">
        <p class="section-kicker">后台管理</p>
        <h1>物联卡商城运营后台</h1>
        <p class="section-desc">统一管理套餐图片、设备图片、订单审核、收款码和前台文案。后续只需要在这里更新图片和说明即可。</p>
        <div class="admin-hero-meta">
          <span class="admin-meta-chip">{{ currentTenant.name || currentTenant.code || '当前租户' }}</span>
          <span class="admin-meta-chip">{{ currentAdminTabLabel }}</span>
          <span class="admin-meta-chip">{{ adminLastRefreshedAt ? ('最近刷新 ' + formatDateTime(adminLastRefreshedAt)) : '尚未刷新' }}</span>
        </div>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn dark" :disabled="savingStates.adminRefresh" @click="refreshAdminData">{{ savingStates.adminRefresh ? '刷新中...' : '刷新数据' }}</button>
        <button class="solid-btn" @click="goStorefront">返回前台</button>
      </div>
    </header>

    <section class="tab-row">
      <button v-for="tab in visibleAdminTabs" :key="tab.value" class="tab-btn" :class="{ active: adminTab === tab.value }" @click="setAdminTab(tab.value)">{{ tab.label }}</button>
    </section>

    <section v-if="adminTab === 'dashboard'" class="admin-panel">
      <div v-if="adminDashboard.ems_auto_track_sync_fail_count" class="warning-strip danger-lite">
        <strong>EMS 自动轨迹同步告警</strong>
        <p>当前有 {{ adminDashboard.ems_auto_track_sync_fail_count }} 个订单自动同步连续失败 2 次及以上，请优先排查 EMS 接口、网络或单号状态。</p>
        <div class="inline-badges">
          <span v-for="item in adminDashboard.ems_auto_track_sync_fail_orders" :key="item.id">{{ item.order_no }} / 连续 {{ item.failure_count }} 次</span>
        </div>
      </div>
      <section v-if="adminDashboard.alerts && adminDashboard.alerts.length" class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>经营告警中心</h3>
            <p class="section-desc">这里会聚合租户授权、配置缺项、履约超时、EMS 失败和库存预警。</p>
          </div>
        </div>
        <div class="alert-stack">
          <article v-for="alert in adminDashboard.alerts" :key="alert.key" class="alert-item" :class="alert.severity">
            <div class="alert-item-head">
              <strong>{{ alert.title }}</strong>
              <span>{{ alertSeverityText(alert) }}</span>
            </div>
            <p>{{ alert.message }}</p>
          </article>
        </div>
      </section>
      <div class="dashboard-grid">
        <article class="dashboard-card"><span>上架套餐</span><strong>{{ adminDashboard.plan_count }}</strong></article>
        <article class="dashboard-card"><span>上架设备</span><strong>{{ adminDashboard.device_count }}</strong></article>
        <article class="dashboard-card"><span>订单总数</span><strong>{{ adminDashboard.order_count }}</strong></article>
        <article class="dashboard-card"><span>用户数量</span><strong>{{ adminDashboard.user_count }}</strong></article>
        <article class="dashboard-card accent"><span>累计金额</span><strong>{{ currency(adminDashboard.total_revenue) }}</strong></article>
        <article class="dashboard-card warn"><span>待审核订单</span><strong>{{ adminDashboard.pending_count }}</strong></article>
      </div>
      <div class="dashboard-grid secondary">
        <article class="summary-card"><h3>今日订单</h3><strong>{{ adminDashboard.order_count_today }}</strong><p>{{ currency(adminDashboard.revenue_today) }}</p></article>
        <article class="summary-card"><h3>近 7 天</h3><strong>{{ adminDashboard.order_count_7d }}</strong><p>{{ currency(adminDashboard.revenue_7d) }}</p></article>
        <article class="summary-card"><h3>近 30 天</h3><strong>{{ adminDashboard.order_count_30d }}</strong><p>{{ currency(adminDashboard.revenue_30d) }}</p></article>
        <article class="summary-card"><h3>客单价</h3><strong>{{ currency(adminDashboard.avg_order_amount) }}</strong><p>按未取消订单计算</p></article>
        <article class="summary-card"><h3>配卡中</h3><strong>{{ adminDashboard.configuring_count }}</strong><p>当前处理中订单</p></article>
        <article class="summary-card"><h3>待发货</h3><strong>{{ adminDashboard.ready_to_ship_count }}</strong><p>优先跟进发货</p></article>
        <article class="summary-card"><h3>已发货</h3><strong>{{ adminDashboard.shipped_count }}</strong><p>等待签收确认</p></article>
        <article class="summary-card"><h3>已完成</h3><strong>{{ adminDashboard.completed_count }}</strong><p>已完成闭环</p></article>
      </div>
      <div class="dashboard-grid secondary">
        <article class="summary-card"><h3>购买设备配卡订单</h3><strong>{{ adminDashboard.buy_device_count }}</strong></article>
        <article class="summary-card"><h3>寄设备配卡订单</h3><strong>{{ adminDashboard.ship_device_count }}</strong></article>
        <article class="summary-card"><h3>EMS 异常单</h3><strong>{{ adminDashboard.ems_error_count }}</strong></article>
        <article class="summary-card"><h3>待取面单</h3><strong>{{ adminDashboard.ems_pending_label_count }}</strong></article>
        <article class="summary-card"><h3>待打印</h3><strong>{{ adminDashboard.ems_pending_print_count }}</strong></article>
        <article class="summary-card"><h3>轨迹待同步</h3><strong>{{ adminDashboard.ems_stale_track_count }}</strong></article>
        <article class="summary-card wide-card">
          <h3>低库存提醒</h3>
          <div v-if="adminDashboard.low_stock_devices.length" class="inline-badges">
            <span v-for="device in adminDashboard.low_stock_devices" :key="device.id">{{ device.name }} / 库存 {{ device.stock }}</span>
          </div>
          <p v-else class="muted-copy">当前没有低库存设备。</p>
        </article>
      </div>
      <section class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>经营视图</h3>
            <p class="section-desc">这里会集中展示近 7 天趋势、热销套餐设备和当前履约压力。</p>
          </div>
        </div>
        <div class="dashboard-report-grid">
          <article class="report-card">
            <div class="report-head">
              <strong>近 7 天订单趋势</strong>
              <span>{{ adminDashboard.order_count_7d }} 单</span>
            </div>
            <div class="trend-list">
              <div v-for="item in adminDashboard.daily_order_series" :key="'orders-' + item.date" class="trend-row">
                <span>{{ item.label }}</span>
                <div class="trend-bar"><i :style="dashboardBarStyle(item, dashboardSeriesMax(adminDashboard.daily_order_series))"></i></div>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </article>
          <article class="report-card">
            <div class="report-head">
              <strong>近 7 天销售额</strong>
              <span>{{ currency(adminDashboard.revenue_7d) }}</span>
            </div>
            <div class="trend-list">
              <div v-for="item in adminDashboard.daily_revenue_series" :key="'revenue-' + item.date" class="trend-row">
                <span>{{ item.label }}</span>
                <div class="trend-bar"><i :style="dashboardBarStyle(item, dashboardSeriesMax(adminDashboard.daily_revenue_series))"></i></div>
                <strong>{{ currency(item.value) }}</strong>
              </div>
            </div>
          </article>
          <article class="report-card">
            <div class="report-head">
              <strong>热销套餐</strong>
              <span>{{ adminDashboard.top_plan_orders.length }} 项</span>
            </div>
            <div v-if="adminDashboard.top_plan_orders.length" class="metric-list">
              <div v-for="item in adminDashboard.top_plan_orders" :key="'plan-top-' + item.name" class="metric-row">
                <span>{{ item.name }}</span>
                <strong>{{ topItemCaption(item) }}</strong>
              </div>
            </div>
            <p v-else class="muted-copy">当前还没有套餐销售数据。</p>
          </article>
          <article class="report-card">
            <div class="report-head">
              <strong>热销设备</strong>
              <span>{{ adminDashboard.top_device_orders.length }} 项</span>
            </div>
            <div v-if="adminDashboard.top_device_orders.length" class="metric-list">
              <div v-for="item in adminDashboard.top_device_orders" :key="'device-top-' + item.name" class="metric-row">
                <span>{{ item.name }}</span>
                <strong>{{ topItemCaption(item) }}</strong>
              </div>
            </div>
            <p v-else class="muted-copy">当前还没有设备销售数据。</p>
          </article>
        </div>
        <div class="dashboard-report-grid">
          <article class="report-card">
            <div class="report-head">
              <strong>订单履约提醒</strong>
              <span>{{ adminDashboard.stale_payment_review_count + adminDashboard.ready_to_ship_overdue_count }} 单</span>
            </div>
            <div class="metric-list">
              <div class="metric-row">
                <span>待审核超时</span>
                <strong>{{ adminDashboard.stale_payment_review_count }} 单</strong>
              </div>
              <div class="metric-row">
                <span>待发货超时</span>
                <strong>{{ adminDashboard.ready_to_ship_overdue_count }} 单</strong>
              </div>
            </div>
            <div v-if="adminDashboard.stale_payment_review_orders.length" class="inline-badges">
              <span v-for="item in adminDashboard.stale_payment_review_orders" :key="'review-' + item.id">{{ item.order_no }} / {{ item.aging_hours }}h</span>
            </div>
            <div v-if="adminDashboard.ready_to_ship_overdue_orders.length" class="inline-badges">
              <span v-for="item in adminDashboard.ready_to_ship_overdue_orders" :key="'ship-' + item.id">{{ item.order_no }} / {{ item.aging_hours }}h</span>
            </div>
          </article>
          <article class="report-card">
            <div class="report-head">
              <strong>EMS 流程概览</strong>
              <span>{{ adminDashboard.ems_workflow_overview.track_synced_count || 0 }} 单已同步</span>
            </div>
            <div class="metric-list">
              <div class="metric-row"><span>地址已解析</span><strong>{{ (adminDashboard.ems_workflow_overview || {}).address_parsed_count || 0 }}</strong></div>
              <div class="metric-row"><span>可达校验通过</span><strong>{{ (adminDashboard.ems_workflow_overview || {}).reachable_count || 0 }}</strong></div>
              <div class="metric-row"><span>已生成单号</span><strong>{{ (adminDashboard.ems_workflow_overview || {}).waybill_created_count || 0 }}</strong></div>
              <div class="metric-row"><span>已生成面单</span><strong>{{ (adminDashboard.ems_workflow_overview || {}).label_ready_count || 0 }}</strong></div>
              <div class="metric-row"><span>已打印</span><strong>{{ (adminDashboard.ems_workflow_overview || {}).printed_count || 0 }}</strong></div>
              <div class="metric-row"><span>已同步轨迹</span><strong>{{ (adminDashboard.ems_workflow_overview || {}).track_synced_count || 0 }}</strong></div>
            </div>
          </article>
        </div>
      </section>
      <section class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>EMS 连续失败告警</h3>
            <p class="section-desc">连续 2 次及以上失败的建单、打印、轨迹同步订单会在这里优先高亮。</p>
          </div>
        </div>
        <div class="dashboard-grid secondary">
          <article class="summary-card danger-lite">
            <h3>建单连续失败</h3>
            <strong>{{ adminDashboard.ems_consecutive_create_fail_count }}</strong>
            <div v-if="adminDashboard.ems_consecutive_create_fail_orders.length" class="inline-badges">
              <span v-for="item in adminDashboard.ems_consecutive_create_fail_orders" :key="item.id">{{ item.order_no }} / 连续 {{ item.failure_count }} 次</span>
            </div>
            <p v-else class="muted-copy">当前没有连续失败的建单订单。</p>
          </article>
          <article class="summary-card danger-lite">
            <h3>打印连续失败</h3>
            <strong>{{ adminDashboard.ems_consecutive_print_fail_count }}</strong>
            <div v-if="adminDashboard.ems_consecutive_print_fail_orders.length" class="inline-badges">
              <span v-for="item in adminDashboard.ems_consecutive_print_fail_orders" :key="item.id">{{ item.order_no }} / 连续 {{ item.failure_count }} 次</span>
            </div>
            <p v-else class="muted-copy">当前没有连续失败的打印订单。</p>
          </article>
          <article class="summary-card danger-lite">
            <h3>轨迹同步连续失败</h3>
            <strong>{{ adminDashboard.ems_consecutive_track_fail_count }}</strong>
            <div v-if="adminDashboard.ems_consecutive_track_fail_orders.length" class="inline-badges">
              <span v-for="item in adminDashboard.ems_consecutive_track_fail_orders" :key="item.id">{{ item.order_no }} / 连续 {{ item.failure_count }} 次</span>
            </div>
            <p v-else class="muted-copy">当前没有连续失败的轨迹同步订单。</p>
          </article>
          <article class="summary-card danger-lite">
            <h3>自动同步连续失败</h3>
            <strong>{{ adminDashboard.ems_auto_track_sync_fail_count }}</strong>
            <div v-if="adminDashboard.ems_auto_track_sync_fail_orders.length" class="inline-badges">
              <span v-for="item in adminDashboard.ems_auto_track_sync_fail_orders" :key="item.id">{{ item.order_no }} / 连续 {{ item.failure_count }} 次</span>
            </div>
            <p v-else class="muted-copy">当前没有自动同步连续失败的订单。</p>
          </article>
        </div>
      </section>
      <section class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>最近后台操作</h3>
            <p class="section-desc">用来回看最近谁改了配置、谁处理了物流或授权，排查问题时会更直接。</p>
          </div>
          <button class="outline-btn small" @click="setAdminTab('audit')">查看全部日志</button>
        </div>
        <div class="dashboard-grid secondary">
          <article class="summary-card"><h3>今日操作</h3><strong>{{ adminDashboard.audit_count_today || 0 }}</strong><p>按当前租户范围统计</p></article>
          <article class="summary-card" :class="{ 'danger-lite': (adminDashboard.audit_error_count_today || 0) > 0 }"><h3>失败操作</h3><strong>{{ adminDashboard.audit_error_count_today || 0 }}</strong><p>当前租户最近日志中的失败次数</p></article>
        </div>
        <div v-if="adminDashboard.recent_audit_logs && adminDashboard.recent_audit_logs.length" class="log-list">
          <article v-for="log in adminDashboard.recent_audit_logs" :key="'dashboard-audit-' + log.id" class="log-item">
            <div class="log-item-head">
              <strong>{{ log.summary || log.action }}</strong>
              <span>{{ log.created_at ? formatDateTime(log.created_at) : '刚刚' }}</span>
            </div>
            <p>{{ log.detail || ('操作类型：' + auditCategoryText(log)) }}</p>
            <div class="inline-badges">
              <span>{{ auditCategoryText(log) }}</span>
              <span>{{ auditStatusText(log.status) }}</span>
              <span v-if="log.operator_nickname || log.operator_username">{{ log.operator_nickname || log.operator_username }}</span>
              <span>{{ auditTargetText(log) }}</span>
            </div>
          </article>
        </div>
        <div v-else class="empty-box compact-empty">当前租户还没有后台操作日志。</div>
      </section>
      <section class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>EMS 问题订单</h3>
            <p class="section-desc">这里会优先展示有错误、缺面单、缺打印或轨迹久未同步的订单。</p>
          </div>
        </div>
        <div v-if="adminDashboard.ems_problem_orders && adminDashboard.ems_problem_orders.length" class="log-list">
          <article v-for="problem in adminDashboard.ems_problem_orders" :key="problem.id" class="log-item">
            <div class="log-item-head">
              <strong>{{ problem.order_no }} / {{ problem.customer_name }}</strong>
              <span>{{ problem.last_action_at ? formatDateTime(problem.last_action_at) : '待处理' }}</span>
            </div>
            <p>{{ problem.issue }}</p>
            <div class="copy-inline">
              <button class="outline-btn small" @click="copyText(problem.order_no, '订单号已复制')">复制订单号</button>
              <button v-if="problem.waybill_no" class="outline-btn small" @click="copyText(problem.waybill_no, 'EMS 单号已复制')">复制单号</button>
              <button class="solid-btn small" @click="openAdminOrderFromDashboard(problem)">定位订单</button>
            </div>
          </article>
        </div>
        <div v-else class="empty-box compact-empty">当前没有待关注的 EMS 问题订单。</div>
      </section>
    </section>

    <section v-if="adminTab === '__site_legacy__'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>站点与授权</h2>
          <p class="section-desc">这里集中查看当前租户的前台能力、授权状态、寄件信息、访问地址和域名自检结果，首页只保留经营数据和运营信息。</p>
        </div>
        <div class="hero-actions">
          <button class="outline-btn" :disabled="savingStates.domainDiagnostics" @click="fetchCurrentTenantDomainDiagnostics">{{ savingStates.domainDiagnostics ? '检测中...' : '域名自检' }}</button>
          <a v-if="adminDashboard.tenant" class="outline-btn" :href="tenantStorefrontUrl(adminDashboard.tenant)" target="_blank" rel="noopener">打开前台</a>
          <button v-if="adminPermissionEnabled('tenant.settings')" class="solid-btn" @click="setAdminTab('settings')">前往店铺设置</button>
        </div>
      </div>

      <section v-if="false && adminDashboard.tenant" class="account-panel">
        <div class="detail-grid capability-grid">
          <article class="detail-card capability-card success">
            <span>当前租户</span>
            <strong>{{ adminDashboard.tenant.name || adminDashboard.tenant.code || '当前租户' }}</strong>
            <p>{{ adminDashboard.tenant.code ? ('租户编码：' + adminDashboard.tenant.code) : '当前正在查看本租户的站点信息。' }}</p>
          </article>
          <article class="detail-card capability-card" :class="{ 'danger-lite': !adminDashboard.tenant.sender_name || !adminDashboard.tenant.sender_phone }">
            <span>寄件信息</span>
            <strong>{{ tenantSenderSummaryText(adminDashboard.tenant) }}</strong>
            <p>{{ adminDashboard.tenant.sender_address || '当前还没有补齐寄件地址，建议前往物流设置完善。' }}</p>
          </article>
          <article class="detail-card capability-card">
            <span>前台入口</span>
            <strong>{{ tenantStorefrontLink(adminDashboard.tenant) }}</strong>
            <p>{{ (tenantDomainCollections(adminDashboard.tenant).storefront || []).length ? ('前台已绑定 ' + tenantDomainCollections(adminDashboard.tenant).storefront.length + ' 个域名') : '当前未绑定前台独立域名，默认走系统路径。' }}</p>
            <div class="copy-inline">
              <a class="outline-btn small" :href="tenantStorefrontUrl(adminDashboard.tenant)" target="_blank" rel="noopener">打开前台</a>
              <button class="outline-btn small" @click="copyText(tenantStorefrontLink(adminDashboard.tenant), '前台地址已复制')">复制前台地址</button>
            </div>
          </article>
          <article class="detail-card capability-card">
            <span>后台入口</span>
            <strong>{{ tenantAdminLink(adminDashboard.tenant) }}</strong>
            <p>{{ (tenantDomainCollections(adminDashboard.tenant).admin || []).length ? ('后台已绑定 ' + tenantDomainCollections(adminDashboard.tenant).admin.length + ' 个域名') : '当前未绑定后台独立域名，默认走系统后台路径。' }}</p>
            <div class="copy-inline">
              <a class="outline-btn small" :href="tenantAdminUrl(adminDashboard.tenant)" target="_blank" rel="noopener">打开后台</a>
              <button class="outline-btn small" @click="copyText(tenantAdminLink(adminDashboard.tenant), '后台地址已复制')">复制后台地址</button>
            </div>
          </article>
        </div>

        <div v-if="adminDashboard.tenant.unavailable_message" class="warning-strip danger-lite">
          <strong>授权状态异常</strong>
          <p>{{ adminDashboard.tenant.unavailable_message }}</p>
        </div>

        <div class="section-head compact-head">
          <div>
            <h3>当前租户授权</h3>
            <p class="section-desc">这里会显示当前租户的授权套餐、到期时间和容量使用情况，方便你判断什么时候该续费或升级。</p>
          </div>
        </div>
        <div class="dashboard-grid secondary">
          <article class="summary-card">
            <h3>授权套餐</h3>
            <strong>{{ adminDashboard.tenant.subscription_name || '标准版' }}</strong>
            <p>{{ tenantExpiryText(adminDashboard.tenant) }}</p>
          </article>
          <article class="summary-card" :class="{ 'danger-lite': ((adminDashboard.tenant.limit_summary || {}).users || {}).reached }">
            <h3>用户容量</h3>
            <strong>{{ tenantLimitText((adminDashboard.tenant.limit_summary || {}).users) }}</strong>
            <p>当前客户账号容量</p>
          </article>
          <article class="summary-card" :class="{ 'danger-lite': ((adminDashboard.tenant.limit_summary || {}).orders || {}).reached }">
            <h3>订单容量</h3>
            <strong>{{ tenantLimitText((adminDashboard.tenant.limit_summary || {}).orders) }}</strong>
            <p>当前订单记录容量</p>
          </article>
          <article class="summary-card" :class="{ 'danger-lite': ((adminDashboard.tenant.limit_summary || {}).plans || {}).reached }">
            <h3>套餐容量</h3>
            <strong>{{ tenantLimitText((adminDashboard.tenant.limit_summary || {}).plans) }}</strong>
            <p>可维护套餐数量</p>
          </article>
          <article class="summary-card" :class="{ 'danger-lite': ((adminDashboard.tenant.limit_summary || {}).devices || {}).reached }">
            <h3>设备容量</h3>
            <strong>{{ tenantLimitText((adminDashboard.tenant.limit_summary || {}).devices) }}</strong>
            <p>可维护设备数量</p>
          </article>
          <article class="summary-card" :class="tenantConfigHealthTone(adminDashboard.tenant)">
            <h3>配置健康度</h3>
            <strong>{{ tenantConfigHealthText(adminDashboard.tenant) }}</strong>
            <p>{{ (adminDashboard.tenant.config_health || {}).missing_count ? ('待补 ' + (adminDashboard.tenant.config_health || {}).missing_count + ' 项关键配置') : '当前关键配置已齐全' }}</p>
          </article>
        </div>

        <div class="section-head compact-head">
          <div>
            <h3>授权功能说明</h3>
            <p class="section-desc">这里会直接告诉你每项授权具体能做什么，不再只显示几个字。</p>
          </div>
        </div>
        <div class="detail-grid capability-grid">
          <article v-for="feature in tenantFeatureItems(adminDashboard.tenant.features)" :key="'site-feature-' + feature.code" class="detail-card capability-card">
            <div class="capability-head">
              <span class="capability-icon">{{ feature.icon || '[ALL]' }}</span>
              <span>已开通功能</span>
            </div>
            <strong>{{ feature.label }}</strong>
            <p>{{ feature.description }}</p>
          </article>
        </div>

        <div class="section-head compact-head">
          <div>
            <h3>关键配置检查</h3>
            <p class="section-desc">像寄件信息、独立域名这类项目，都会在这里写清楚用途和当前状态。</p>
          </div>
        </div>
        <div class="detail-grid capability-grid">
          <article
            v-for="item in tenantConfigHealthItems(adminDashboard.tenant)"
            :key="'site-health-' + item.key"
            class="detail-card capability-card"
            :class="{ 'danger-lite': !item.ok }"
          >
            <span>{{ item.status_label }}</span>
            <strong>{{ item.label }}</strong>
            <p>{{ item.value_text }}</p>
          </article>
        </div>

        <div class="section-head compact-head">
          <div>
            <h3>独立域名与访问地址</h3>
            <p class="section-desc">这里直接展示当前租户前台、后台的实际访问入口，以及已经绑定的域名和自检结果。</p>
          </div>
        </div>
        <div v-if="tenantDomainCollections(adminDashboard.tenant).all.length" class="inline-badges">
          <span v-for="domain in tenantDomainCollections(adminDashboard.tenant).all" :key="'site-domain-badge-' + domain">{{ domain }}</span>
        </div>
        <div class="card-actions">
          <button v-if="currentTenantDomainDiagnostics?.snippets?.storefront_nginx" class="outline-btn" @click="copyText(currentTenantDomainDiagnostics.snippets.storefront_nginx, '前台 Nginx 示例已复制')">复制前台 Nginx 示例</button>
          <button v-if="currentTenantDomainDiagnostics?.snippets?.admin_nginx" class="outline-btn" @click="copyText(currentTenantDomainDiagnostics.snippets.admin_nginx, '后台 Nginx 示例已复制')">复制后台 Nginx 示例</button>
          <button v-if="currentTenantDomainDiagnostics?.snippets?.storefront_baota" class="outline-btn" @click="copyText(currentTenantDomainDiagnostics.snippets.storefront_baota, '前台宝塔步骤已复制')">复制前台宝塔步骤</button>
          <button v-if="currentTenantDomainDiagnostics?.snippets?.admin_baota" class="outline-btn" @click="copyText(currentTenantDomainDiagnostics.snippets.admin_baota, '后台宝塔步骤已复制')">复制后台宝塔步骤</button>
        </div>
        <div v-if="currentTenantDomainDiagnostics && currentTenantDomainDiagnostics.summary.total_domains" class="detail-grid capability-grid">
          <article
            v-for="check in [...(currentTenantDomainDiagnostics.storefront_domains || []), ...(currentTenantDomainDiagnostics.admin_domains || [])]"
            :key="'site-domain-check-' + check.role + '-' + check.domain"
            class="detail-card capability-card"
            :class="domainDiagnosticTone(check)"
          >
            <span>{{ check.role === 'admin' ? '后台域名' : '前台域名' }}</span>
            <strong>{{ check.domain }}</strong>
            <p>{{ check.summary }}</p>
            <div class="inline-badges">
              <span>{{ domainDiagnosticStatusText(check) }}</span>
              <span>DNS {{ check.dns_ok ? '已解析' : '未解析' }}</span>
              <span>HTTP {{ check.http_ok ? '可访问' : (check.http_probe || {}).message || '失败' }}</span>
              <span>HTTPS {{ check.https_ok ? '可访问' : (check.https_probe || {}).message || '失败' }}</span>
            </div>
            <p class="muted-copy">{{ (check.hints || []).join('；') }}</p>
          </article>
        </div>
        <div v-else-if="currentTenantDomainDiagnostics" class="empty-box compact-empty">当前租户还没有绑定独立域名，先在租户设置中填写前台或后台主域名。</div>
      </section>
      <div v-else class="empty-box">当前还没有加载到租户站点与授权信息，请先刷新数据后再试。</div>
    </section>

    <section v-if="adminTab === 'site'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>站点与授权</h2>
          <p class="section-desc">这里集中查看当前租户的前台功能、授权状态、寄件信息、访问地址和域名自检结果，首页只保留数据与运营内容。</p>
        </div>
        <div class="hero-actions">
          <button class="outline-btn" :disabled="savingStates.domainDiagnostics" @click="fetchCurrentTenantDomainDiagnostics">{{ savingStates.domainDiagnostics ? '检测中...' : '域名自检' }}</button>
          <a v-if="adminDashboard.tenant" class="outline-btn" :href="tenantStorefrontUrl(adminDashboard.tenant)" target="_blank" rel="noopener">打开前台</a>
          <button v-if="adminPermissionEnabled('tenant.settings')" class="solid-btn" @click="setAdminTab('settings')">前往店铺设置</button>
        </div>
      </div>

      <section v-if="adminDashboard.tenant" class="account-panel">
        <div v-if="adminDashboard.tenant.unavailable_message" class="warning-strip danger-lite">
          <strong>授权状态异常</strong>
          <p>{{ adminDashboard.tenant.unavailable_message }}</p>
        </div>
        <div class="detail-grid capability-grid">
          <article class="detail-card capability-card success">
            <span>当前租户</span>
            <strong>{{ adminDashboard.tenant.name || adminDashboard.tenant.code || '当前租户' }}</strong>
            <p>{{ adminDashboard.tenant.code ? ('租户编码：' + adminDashboard.tenant.code) : '当前正在查看本租户的站点与授权信息。' }}</p>
          </article>
          <article class="detail-card capability-card" :class="{ 'danger-lite': !(adminDashboard.tenant.sender_name && adminDashboard.tenant.sender_phone) }">
            <span>寄件信息</span>
            <strong>{{ tenantSenderSummaryText(adminDashboard.tenant) }}</strong>
            <p>{{ adminDashboard.tenant.sender_address || '当前还没有补齐寄件地址，建议尽快在物流设置里配置。' }}</p>
          </article>
          <article class="detail-card capability-card">
            <span>前台入口</span>
            <strong>{{ tenantStorefrontLink(adminDashboard.tenant) }}</strong>
            <p>{{ (tenantDomainCollections(adminDashboard.tenant).storefront || []).length ? ('前台已绑定 ' + tenantDomainCollections(adminDashboard.tenant).storefront.length + ' 个域名') : '当前未绑定前台独立域名，默认走系统路径。' }}</p>
            <div class="copy-inline">
              <a class="outline-btn small" :href="tenantStorefrontUrl(adminDashboard.tenant)" target="_blank" rel="noopener">打开前台</a>
              <button class="outline-btn small" @click="copyText(tenantStorefrontLink(adminDashboard.tenant), '前台地址已复制')">复制前台地址</button>
            </div>
          </article>
          <article class="detail-card capability-card">
            <span>后台入口</span>
            <strong>{{ tenantAdminLink(adminDashboard.tenant) }}</strong>
            <p>{{ (tenantDomainCollections(adminDashboard.tenant).admin || []).length ? ('后台已绑定 ' + tenantDomainCollections(adminDashboard.tenant).admin.length + ' 个域名') : '当前未绑定后台独立域名，默认走系统后台路径。' }}</p>
            <div class="copy-inline">
              <a class="outline-btn small" :href="tenantAdminUrl(adminDashboard.tenant)" target="_blank" rel="noopener">打开后台</a>
              <button class="outline-btn small" @click="copyText(tenantAdminLink(adminDashboard.tenant), '后台地址已复制')">复制后台地址</button>
            </div>
          </article>
        </div>

        <div class="section-head compact-head">
          <div>
            <h3>当前租户授权</h3>
            <p class="section-desc">这里会显示当前租户的授权套餐、到期时间和容量使用情况，方便你判断什么时候该续费或升级。</p>
          </div>
        </div>
        <div class="dashboard-grid secondary">
          <article class="summary-card">
            <h3>授权套餐</h3>
            <strong>{{ adminDashboard.tenant.subscription_name || '标准版' }}</strong>
            <p>{{ tenantExpiryText(adminDashboard.tenant) }}</p>
          </article>
          <article class="summary-card" :class="{ 'danger-lite': ((adminDashboard.tenant.limit_summary || {}).users || {}).reached }">
            <h3>用户容量</h3>
            <strong>{{ tenantLimitText((adminDashboard.tenant.limit_summary || {}).users) }}</strong>
            <p>当前客户账号容量</p>
          </article>
          <article class="summary-card" :class="{ 'danger-lite': ((adminDashboard.tenant.limit_summary || {}).orders || {}).reached }">
            <h3>订单容量</h3>
            <strong>{{ tenantLimitText((adminDashboard.tenant.limit_summary || {}).orders) }}</strong>
            <p>当前订单记录容量</p>
          </article>
          <article class="summary-card" :class="{ 'danger-lite': ((adminDashboard.tenant.limit_summary || {}).plans || {}).reached }">
            <h3>套餐容量</h3>
            <strong>{{ tenantLimitText((adminDashboard.tenant.limit_summary || {}).plans) }}</strong>
            <p>可维护套餐数量</p>
          </article>
          <article class="summary-card" :class="{ 'danger-lite': ((adminDashboard.tenant.limit_summary || {}).devices || {}).reached }">
            <h3>设备容量</h3>
            <strong>{{ tenantLimitText((adminDashboard.tenant.limit_summary || {}).devices) }}</strong>
            <p>可维护设备数量</p>
          </article>
          <article class="summary-card" :class="tenantConfigHealthTone(adminDashboard.tenant)">
            <h3>配置健康度</h3>
            <strong>{{ tenantConfigHealthText(adminDashboard.tenant) }}</strong>
            <p>{{ (adminDashboard.tenant.config_health || {}).missing_count ? ('待补 ' + (adminDashboard.tenant.config_health || {}).missing_count + ' 项关键配置') : '当前关键配置已齐全' }}</p>
          </article>
        </div>

        <div class="section-head compact-head">
          <div>
            <h3>授权功能说明</h3>
            <p class="section-desc">不再只显示几个字，这里会直接告诉你每项授权具体能做什么。</p>
          </div>
        </div>
        <div class="detail-grid capability-grid">
          <article v-for="feature in tenantFeatureItems(adminDashboard.tenant.features)" :key="'site-feature-' + feature.code" class="detail-card capability-card">
            <div class="capability-head">
              <span class="capability-icon">{{ feature.icon || '[ALL]' }}</span>
              <span>已开通功能</span>
            </div>
            <strong>{{ feature.label }}</strong>
            <p>{{ feature.description }}</p>
          </article>
        </div>

        <div class="section-head compact-head">
          <div>
            <h3>关键配置检查</h3>
            <p class="section-desc">像寄件信息、独立域名这类项目，都会在这里写清楚用途和当前状态。</p>
          </div>
        </div>
        <div class="detail-grid capability-grid">
          <article
            v-for="item in tenantConfigHealthItems(adminDashboard.tenant)"
            :key="'site-health-' + item.key"
            class="detail-card capability-card"
            :class="{ 'danger-lite': !item.ok }"
          >
            <span>{{ item.status_label }}</span>
            <strong>{{ item.label }}</strong>
            <p>{{ item.value_text }}</p>
          </article>
        </div>

        <div class="section-head compact-head">
          <div>
            <h3>独立域名与访问地址</h3>
            <p class="section-desc">这里直接展示当前租户前台、后台的实际访问入口，以及已经绑定的域名。</p>
          </div>
        </div>
        <div v-if="tenantDomainCollections(adminDashboard.tenant).all.length" class="inline-badges">
          <span v-for="domain in tenantDomainCollections(adminDashboard.tenant).all" :key="'site-domain-badge-' + domain">{{ domain }}</span>
        </div>
        <div class="card-actions">
          <button v-if="currentTenantDomainDiagnostics?.snippets?.storefront_nginx" class="outline-btn" @click="copyText(currentTenantDomainDiagnostics.snippets.storefront_nginx, '前台 Nginx 示例已复制')">复制前台 Nginx 示例</button>
          <button v-if="currentTenantDomainDiagnostics?.snippets?.admin_nginx" class="outline-btn" @click="copyText(currentTenantDomainDiagnostics.snippets.admin_nginx, '后台 Nginx 示例已复制')">复制后台 Nginx 示例</button>
          <button v-if="currentTenantDomainDiagnostics?.snippets?.storefront_baota" class="outline-btn" @click="copyText(currentTenantDomainDiagnostics.snippets.storefront_baota, '前台宝塔步骤已复制')">复制前台宝塔步骤</button>
          <button v-if="currentTenantDomainDiagnostics?.snippets?.admin_baota" class="outline-btn" @click="copyText(currentTenantDomainDiagnostics.snippets.admin_baota, '后台宝塔步骤已复制')">复制后台宝塔步骤</button>
        </div>
        <div v-if="currentTenantDomainDiagnostics && currentTenantDomainDiagnostics.summary.total_domains" class="detail-grid capability-grid">
          <article
            v-for="check in [...(currentTenantDomainDiagnostics.storefront_domains || []), ...(currentTenantDomainDiagnostics.admin_domains || [])]"
            :key="'site-domain-check-' + check.role + '-' + check.domain"
            class="detail-card capability-card"
            :class="domainDiagnosticTone(check)"
          >
            <span>{{ check.role === 'admin' ? '后台域名' : '前台域名' }}</span>
            <strong>{{ check.domain }}</strong>
            <p>{{ check.summary }}</p>
            <div class="inline-badges">
              <span>{{ domainDiagnosticStatusText(check) }}</span>
              <span>DNS {{ check.dns_ok ? '已解析' : '未解析' }}</span>
              <span>HTTP {{ check.http_ok ? '可访问' : (check.http_probe || {}).message || '失败' }}</span>
              <span>HTTPS {{ check.https_ok ? '可访问' : (check.https_probe || {}).message || '失败' }}</span>
            </div>
            <p class="muted-copy">{{ (check.hints || []).join('；') }}</p>
          </article>
        </div>
        <div v-else-if="currentTenantDomainDiagnostics" class="empty-box compact-empty">当前租户还没有绑定独立域名，先在租户设置中填写前台或后台主域名。</div>
      </section>
      <div v-else class="empty-box">暂未读取到当前租户站点与授权信息，请先刷新后台数据后再试。</div>
    </section>

    <section v-if="adminTab === 'platform' && isPlatformAdmin" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>租户管理</h2>
          <p class="section-desc">这里统一管理每个客户的租户授权、后台账号、访问地址和经营数据，后面做 SaaS 发版和授权都从这里走。</p>
        </div>
        <div class="hero-actions">
          <button class="outline-btn" :disabled="savingStates.tenants" @click="fetchPlatformTenants">刷新租户</button>
          <button class="solid-btn" @click="openTenantEditor()">新增租户</button>
        </div>
      </div>

      <div class="dashboard-grid secondary">
        <article class="summary-card"><h3>租户总数</h3><strong>{{ platformTenantStats.total_count }}</strong></article>
        <article class="summary-card"><h3>正常可用</h3><strong>{{ platformTenantStats.active_count }}</strong></article>
        <article class="summary-card"><h3>配置健康</h3><strong>{{ platformTenantStats.healthy_count }}</strong></article>
        <article class="summary-card"><h3>待补配置</h3><strong>{{ platformTenantStats.config_warning_count }}</strong></article>
        <article class="summary-card"><h3>7 天内到期</h3><strong>{{ platformTenantStats.expiring_soon_count }}</strong></article>
        <article class="summary-card danger-lite"><h3>已到期</h3><strong>{{ platformTenantStats.expired_count }}</strong></article>
        <article class="summary-card danger-lite"><h3>已暂停</h3><strong>{{ platformTenantStats.suspended_count }}</strong></article>
      </div>

      <section v-if="showTenantEditor" class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>{{ tenantEditorForm.id ? '编辑租户' : '新增租户' }}</h3>
            <p class="section-desc">创建后会自动写入租户管理员账号。默认平台租户不能改编码，也不能停用。</p>
          </div>
        </div>
        <div v-if="tenantEditorForm.id === 1" class="warning-strip danger-lite">
          <strong>默认平台租户受保护</strong>
          <p>默认租户固定使用 <code>default</code> 编码，并保持启用。你可以修改名称、联系方式和平台管理员账号信息。</p>
        </div>
        <div class="admin-form-grid">
          <input v-model.trim="tenantEditorForm.code" class="input" :disabled="tenantEditorForm.id === 1" placeholder="租户编码，例如 shopa">
          <input v-model.trim="tenantEditorForm.name" class="input" placeholder="租户名称">
          <select v-model="tenantEditorForm.status" class="input" :disabled="tenantEditorForm.id === 1">
            <option value="active">启用中</option>
            <option value="inactive">未启用</option>
            <option value="suspended">已暂停</option>
          </select>
          <input v-model.trim="tenantEditorForm.expires_at" type="date" class="input" placeholder="授权到期时间">
          <input v-model.trim="tenantEditorForm.subscription_name" class="input" placeholder="授权套餐名称，例如 标准版 / 旗舰版">
          <select v-model="tenantEditorForm.subscription_type" class="input">
            <option value="paid">正式版</option>
            <option value="trial">试用版</option>
            <option value="manual">手工授权</option>
          </select>
          <label class="switch-line">
            <input type="checkbox" v-model="tenantEditorForm.auto_suspend_on_expiry">
            <span>到期自动停用</span>
          </label>
          <input v-model.number="tenantEditorForm.max_user_count" type="number" min="0" class="input" placeholder="用户数上限，0 为不限">
          <input v-model.number="tenantEditorForm.max_order_count" type="number" min="0" class="input" placeholder="订单容量上限，0 为不限">
          <input v-model.number="tenantEditorForm.max_plan_count" type="number" min="0" class="input" placeholder="套餐数量上限，0 为不限">
          <input v-model.number="tenantEditorForm.max_device_count" type="number" min="0" class="input" placeholder="设备数量上限，0 为不限">
          <div class="permission-picker full-span">
            <div class="permission-picker-head">
              <div>
                <span>功能授权</span>
                <p class="muted-copy">这里直接按中文勾选开通功能，系统内部会自动转换成稳定的授权代码。</p>
              </div>
              <button type="button" class="ghost-btn dark small" @click="resetTenantFeaturesToDefault">恢复标准功能</button>
            </div>
            <div v-if="tenantFeatureOptions.length" class="permission-grid">
              <label
                v-for="feature in tenantFeatureOptions"
                :key="'tenant-feature-option-' + feature.code"
                class="permission-option"
                :class="{ active: tenantEditorForm.features.includes(feature.code) }"
              >
                <input v-model="tenantEditorForm.features" type="checkbox" :value="feature.code">
                <div>
                  <strong>{{ feature.icon }} {{ feature.label }}</strong>
                  <p>{{ feature.description }}</p>
                </div>
              </label>
            </div>
            <div class="inline-badges">
              <span v-for="feature in tenantFeatureItems(tenantEditorForm.features)" :key="'tenant-feature-selected-' + feature.code">{{ feature.icon || '[ALL]' }} {{ feature.label }}</span>
            </div>
          </div>
          <input v-model.trim="tenantEditorForm.primary_domain" class="input" placeholder="前台主域名，例如 shop.example.com">
          <input v-model.trim="tenantEditorForm.primary_admin_domain" class="input" placeholder="后台主域名，例如 admin.shop.example.com">
          <textarea v-model.trim="tenantEditorForm.domain_bindings_text" class="input full-span" rows="2" placeholder="前台绑定域名，一行一个，可填独立域名或二级域名"></textarea>
          <textarea v-model.trim="tenantEditorForm.admin_domain_bindings_text" class="input full-span" rows="2" placeholder="后台绑定域名，一行一个，可留空"></textarea>
          <input v-model.trim="tenantEditorForm.contact_name" class="input" placeholder="联系人姓名">
          <input v-model.trim="tenantEditorForm.contact_phone" class="input" placeholder="联系人电话">
          <textarea v-model.trim="tenantEditorForm.note" class="input full-span" rows="3" placeholder="租户备注，例如套餐、授权说明、部署记录"></textarea>
          <input v-model.trim="tenantEditorForm.admin_username" class="input" placeholder="租户管理员账号">
          <input v-model.trim="tenantEditorForm.admin_nickname" class="input" placeholder="租户管理员昵称">
          <input v-model.trim="tenantEditorForm.admin_phone" class="input" placeholder="租户管理员手机号">
          <div class="password-field">
            <input v-model.trim="tenantEditorForm.admin_password" :type="secretInputType('tenant_admin_password')" class="input" :placeholder="tenantEditorForm.id ? '新密码，不修改可留空' : '租户管理员密码，至少 6 位'">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('tenant_admin_password')">{{ isSecretFieldVisible('tenant_admin_password') ? '隐藏' : '显示' }}</button>
          </div>
          <div class="password-field">
            <input v-model.trim="tenantEditorForm.admin_password_confirm" :type="secretInputType('tenant_admin_password_confirm')" class="input" placeholder="确认租户管理员密码">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('tenant_admin_password_confirm')">{{ isSecretFieldVisible('tenant_admin_password_confirm') ? '隐藏' : '显示' }}</button>
          </div>
        </div>
        <div class="card-actions">
          <button class="outline-btn" @click="closeTenantEditor">取消</button>
          <button class="solid-btn" :disabled="savingStates.tenants || !isTenantEditorDirty" @click="saveTenantEditor">{{ savingStates.tenants ? '保存中...' : (tenantEditorForm.id ? '保存租户' : '创建租户') }}</button>
        </div>
      </section>

      <div v-if="platformTenants.length" class="admin-card-grid tenant-card-grid">
        <article v-for="tenant in platformTenants" :key="tenant.id" class="admin-item-card tenant-admin-card">
          <div class="card-headline">
            <div>
              <span class="mini-badge">{{ tenant.code }}</span>
              <h3>{{ tenant.name }}</h3>
            </div>
            <span class="status-pill" :class="tenant.is_expired ? 'inactive' : tenant.status">{{ tenant.is_expired ? '已到期' : (tenant.status === 'active' ? '启用中' : (tenant.status === 'suspended' ? '已暂停' : '未启用')) }}</span>
          </div>
          <div class="inline-badges">
            <span v-if="tenant.id === 1">平台默认租户</span>
            <span>{{ tenant.subscription_name || '标准版' }}</span>
            <span>{{ tenant.store_name || '未设置店铺名' }}</span>
            <span>{{ tenant.admin_username || '未设置管理员' }}</span>
            <span>{{ tenantExpiryText(tenant) }}</span>
          </div>
          <div v-if="tenant.unavailable_message" class="warning-strip danger-lite compact-warning">
            <strong>当前不可用</strong>
            <p>{{ tenant.unavailable_message }}</p>
          </div>
          <div class="detail-grid">
            <div class="detail-card">
              <span>数据概览</span>
              <strong>{{ tenant.order_count }} 单 / {{ tenant.user_count }} 用户</strong>
              <p>套餐 {{ tenant.plan_count }} / 设备 {{ tenant.device_count }} / 销售额 {{ currency(tenant.total_revenue) }}</p>
            </div>
            <div class="detail-card">
              <span>授权容量</span>
              <strong>用户 {{ tenantLimitText((tenant.limit_summary || {}).users) }}</strong>
              <p>订单 {{ tenantLimitText((tenant.limit_summary || {}).orders) }} / 套餐 {{ tenantLimitText((tenant.limit_summary || {}).plans) }} / 设备 {{ tenantLimitText((tenant.limit_summary || {}).devices) }}</p>
            </div>
            <div class="detail-card">
              <span>联系人</span>
              <strong>{{ tenant.contact_name || '未填写' }}</strong>
              <p>{{ tenant.contact_phone || '未填写联系电话' }}</p>
            </div>
            <div class="detail-card">
              <span>租户后台</span>
              <strong>{{ tenant.admin_username || '未配置账号' }}</strong>
              <p>{{ tenant.admin_phone || tenant.admin_nickname || '可用这里给客户开后台' }}</p>
            </div>
            <div class="detail-card">
              <span>寄件信息</span>
              <strong>{{ tenant.sender_name || '未配置寄件人' }}</strong>
              <p>{{ tenant.sender_phone || '未配置寄件电话' }}</p>
            </div>
            <div class="detail-card">
              <span>独立域名</span>
              <strong>{{ tenantDomainCollections(tenant).all.length ? (tenantDomainCollections(tenant).all.length + ' 个已绑定域名') : '未绑定独立域名' }}</strong>
              <p>{{ tenantDomainSummaryText(tenant) }}</p>
            </div>
            <div class="detail-card">
              <span>备注</span>
              <strong>{{ tenant.note || '暂无备注' }}</strong>
              <p>{{ tenant.store_name ? ('店铺名：' + tenant.store_name) : '创建后可由租户自行配置店铺信息' }}</p>
            </div>
            <div class="detail-card" :class="tenantConfigHealthTone(tenant)">
              <span>配置健康度</span>
              <strong>{{ tenantConfigHealthText(tenant) }}</strong>
              <p>{{ (tenant.config_health || {}).missing_count ? ('待补 ' + (tenant.config_health || {}).missing_count + ' 项关键配置') : '当前关键配置已齐全' }}</p>
            </div>
          </div>
          <div class="inline-badges">
            <span
              v-for="feature in tenantFeatureItems(tenant.features)"
              :key="tenant.id + '-' + feature.code"
              :title="tenantFeatureTooltip(feature)"
            >{{ feature.icon || '[ALL]' }} {{ feature.label }}</span>
          </div>
          <div v-if="tenantConfigMissingItems(tenant).length" class="inline-badges">
            <span
              v-for="item in tenantConfigMissingItems(tenant)"
              :key="'tenant-warning-' + tenant.id + '-' + item.key"
              :title="item.value_text"
            >{{ item.label }} / {{ item.status_label }}</span>
          </div>
          <div class="card-actions">
            <button class="outline-btn small" :disabled="isTenantDomainDiagnosticsLoading(tenant.id)" @click="fetchTenantDomainDiagnostics(tenant)">{{ isTenantDomainDiagnosticsLoading(tenant.id) ? '检测中...' : '域名自检' }}</button>
            <button v-if="tenantDomainDiagnosticsFor(tenant)?.snippets?.storefront_nginx" class="outline-btn small" @click="copyText(tenantDomainDiagnosticsFor(tenant).snippets.storefront_nginx, '前台 Nginx 示例已复制')">前台 Nginx</button>
            <button v-if="tenantDomainDiagnosticsFor(tenant)?.snippets?.admin_nginx" class="outline-btn small" @click="copyText(tenantDomainDiagnosticsFor(tenant).snippets.admin_nginx, '后台 Nginx 示例已复制')">后台 Nginx</button>
            <button v-if="tenantDomainDiagnosticsFor(tenant)?.snippets?.storefront_baota" class="outline-btn small" @click="copyText(tenantDomainDiagnosticsFor(tenant).snippets.storefront_baota, '前台宝塔步骤已复制')">前台宝塔</button>
            <button v-if="tenantDomainDiagnosticsFor(tenant)?.snippets?.admin_baota" class="outline-btn small" @click="copyText(tenantDomainDiagnosticsFor(tenant).snippets.admin_baota, '后台宝塔步骤已复制')">后台宝塔</button>
          </div>
          <div v-if="tenantDomainDiagnosticsFor(tenant) && tenantDomainDiagnosticsFor(tenant).summary.total_domains" class="detail-grid capability-grid">
            <article
              v-for="check in [...(tenantDomainDiagnosticsFor(tenant).storefront_domains || []), ...(tenantDomainDiagnosticsFor(tenant).admin_domains || [])]"
              :key="'tenant-check-' + tenant.id + '-' + check.role + '-' + check.domain"
              class="detail-card capability-card"
              :class="domainDiagnosticTone(check)"
            >
              <span>{{ check.role === 'admin' ? '后台域名' : '前台域名' }}</span>
              <strong>{{ check.domain }}</strong>
              <p>{{ check.summary }}</p>
              <div class="inline-badges">
                <span>{{ domainDiagnosticStatusText(check) }}</span>
                <span>DNS {{ check.dns_ok ? '已解析' : '未解析' }}</span>
                <span>HTTP {{ check.http_ok ? '可访问' : (check.http_probe || {}).message || '失败' }}</span>
                <span>HTTPS {{ check.https_ok ? '可访问' : (check.https_probe || {}).message || '失败' }}</span>
              </div>
            </article>
          </div>
          <div class="tenant-link-list">
            <div class="tenant-link-item">
              <span class="field-label">前台地址</span>
              <code class="tenant-path">{{ tenantStorefrontLink(tenant) }}</code>
              <div class="copy-inline">
                <a class="outline-btn small" :href="tenantStorefrontUrl(tenant)" target="_blank" rel="noopener">打开前台</a>
                <button class="outline-btn small" @click="copyText(tenantStorefrontLink(tenant), '前台地址已复制')">复制地址</button>
              </div>
            </div>
            <div class="tenant-link-item">
              <span class="field-label">后台地址</span>
              <code class="tenant-path">{{ tenantAdminLink(tenant) }}</code>
              <div class="copy-inline">
                <a class="outline-btn small" :href="tenantAdminUrl(tenant)" target="_blank" rel="noopener">打开后台</a>
                <button class="outline-btn small" @click="copyText(tenantAdminLink(tenant), '后台地址已复制')">复制地址</button>
              </div>
            </div>
          </div>
          <div v-if="tenantDomainCollections(tenant).all.length" class="inline-badges">
            <span v-for="domain in tenantDomainCollections(tenant).all" :key="'tenant-domain-' + tenant.id + '-' + domain">{{ domain }}</span>
          </div>
          <div class="card-actions">
            <button class="outline-btn" @click="openTenantEditor(tenant)">编辑租户</button>
            <button class="outline-btn" @click="openBillingEditor(buildTenantBillingSeed(tenant))">创建续费</button>
            <button class="outline-btn" @click="copyText(tenant.code, '租户编码已复制')">复制编码</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-box">当前还没有租户，先创建第一个客户租户。</div>
    </section>

    <section v-if="adminTab === 'billing' && isPlatformAdmin" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>计费记录与授权订单</h2>
          <p class="section-desc">这里统一创建试用、续费和手工授权记录，支持创建后立即应用到租户。</p>
        </div>
        <div class="hero-actions">
          <button class="outline-btn" :disabled="savingStates.billing" @click="fetchPlatformBillingRecords">刷新记录</button>
          <button class="solid-btn" @click="openBillingEditor()">新建记录</button>
        </div>
      </div>

      <section v-if="showBillingEditor" class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>新建计费记录</h3>
            <p class="section-desc">支持试用、续费、手工调整和授权订单，勾选“立即应用”后会直接把授权写入租户。</p>
          </div>
        </div>
        <div class="admin-form-grid">
          <select v-model="billingEditorForm.tenant_id" class="input">
            <option value="">选择租户</option>
            <option v-for="tenant in platformBillingTenants" :key="'billing-tenant-' + tenant.id" :value="String(tenant.id)">{{ tenant.name }} / {{ tenant.code }}</option>
          </select>
          <select v-model="billingEditorForm.kind" class="input">
            <option value="renewal">续费</option>
            <option value="trial">试用</option>
            <option value="manual_adjustment">手工调整</option>
            <option value="license_order">授权订单</option>
          </select>
          <input v-model.trim="billingEditorForm.subscription_name" class="input" placeholder="授权套餐名称">
          <input v-model.number="billingEditorForm.amount" type="number" min="0" class="input" placeholder="金额">
          <input v-model.number="billingEditorForm.duration_days" type="number" class="input" placeholder="授权天数，可填负数">
          <label class="switch-line">
            <input type="checkbox" v-model="billingEditorForm.apply_now">
            <span>创建后立即应用</span>
          </label>
          <input v-model="billingEditorForm.max_user_count" type="number" min="0" class="input" placeholder="用户上限，留空表示不改">
          <input v-model="billingEditorForm.max_order_count" type="number" min="0" class="input" placeholder="订单上限，留空表示不改">
          <input v-model="billingEditorForm.max_plan_count" type="number" min="0" class="input" placeholder="套餐上限，留空表示不改">
          <input v-model="billingEditorForm.max_device_count" type="number" min="0" class="input" placeholder="设备上限，留空表示不改">
          <div class="permission-picker full-span">
            <div class="permission-picker-head">
              <div>
                <span>功能授权</span>
                <p class="muted-copy">不勾选任何功能时，表示沿用当前租户已有授权；勾选后则按本次记录覆盖。</p>
              </div>
              <div class="hero-actions">
                <button type="button" class="ghost-btn dark small" @click="clearBillingFeatureOverride">沿用当前授权</button>
                <button type="button" class="ghost-btn dark small" @click="resetBillingFeaturesToDefault">套用标准功能</button>
              </div>
            </div>
            <div v-if="billingFeatureOptions.length" class="permission-grid">
              <label
                v-for="feature in billingFeatureOptions"
                :key="'billing-feature-option-' + feature.code"
                class="permission-option"
                :class="{ active: billingEditorForm.features.includes(feature.code) }"
              >
                <input v-model="billingEditorForm.features" type="checkbox" :value="feature.code">
                <div>
                  <strong>{{ feature.icon }} {{ feature.label }}</strong>
                  <p>{{ feature.description }}</p>
                </div>
              </label>
            </div>
            <p v-if="!billingEditorForm.features.length" class="muted-copy">当前未单独覆盖功能授权，保存后会沿用租户已有功能。</p>
            <div v-else class="inline-badges">
              <span v-for="feature in tenantFeatureItems(billingEditorForm.features)" :key="'billing-feature-selected-' + feature.code">{{ feature.icon || '[ALL]' }} {{ feature.label }}</span>
            </div>
          </div>
          <label class="switch-line">
            <input type="checkbox" v-model="billingEditorForm.auto_suspend_on_expiry">
            <span>到期自动停用</span>
          </label>
          <textarea v-model.trim="billingEditorForm.note" class="input full-span" rows="3" placeholder="备注，例如试用原因、续费说明、授权来源"></textarea>
        </div>
        <div class="card-actions">
          <button class="outline-btn" @click="closeBillingEditor">取消</button>
          <button class="solid-btn" :disabled="savingStates.billing || !isBillingEditorDirty" @click="saveBillingRecord">{{ savingStates.billing ? '保存中...' : '保存计费记录' }}</button>
        </div>
      </section>

      <div v-if="platformBillingRecords.length" class="log-list">
        <article v-for="record in platformBillingRecords" :key="record.id" class="log-item">
          <div class="log-item-head">
            <strong>{{ record.record_no }} / {{ record.tenant_name || record.tenant_code || ('租户 ' + record.tenant_id) }}</strong>
            <span>{{ record.created_at ? formatDateTime(record.created_at) : '刚刚创建' }}</span>
          </div>
          <p>{{ record.subscription_name || '未填写套餐名' }} / {{ billingKindLabel(record.kind) }} / {{ record.duration_days }} 天 / {{ currency(record.amount || 0) }}</p>
          <p class="muted-copy">状态：{{ billingStatusLabel(record.status) }}；到期前：{{ record.before_expires_at || '未记录' }}；应用后：{{ record.after_expires_at || '待应用' }}</p>
          <div v-if="record.payload && Array.isArray(record.payload.features) && record.payload.features.length" class="inline-badges">
            <span
              v-for="feature in tenantFeatureItems(record.payload.features)"
              :key="'billing-record-feature-' + record.id + '-' + feature.code"
              :title="tenantFeatureTooltip(feature)"
            >{{ feature.icon || '[+]' }} {{ feature.label }}</span>
          </div>
          <p v-if="record.note">{{ record.note }}</p>
          <div class="copy-inline">
            <button class="outline-btn small" @click="copyText(record.record_no, '计费单号已复制')">复制单号</button>
            <button class="outline-btn small" @click="openBillingEditor(buildBillingRecordSeed(record))">按此记录再开一单</button>
            <button v-if="record.status !== 'applied'" class="solid-btn small" :disabled="savingStates.billing" @click="applyBillingRecord(record)">{{ savingStates.billing ? '处理中...' : '立即应用' }}</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-box">当前还没有计费记录，可以先创建试用或续费记录。</div>
    </section>

    <section v-if="adminTab === 'audit'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>后台操作日志</h2>
          <p class="section-desc">集中查看配置、商品、订单、物流、授权和员工账号操作，后续排查问题会更快。</p>
        </div>
        <div class="hero-actions">
          <button class="outline-btn" @click="fetchAdminAuditLogs">刷新日志</button>
          <button class="outline-btn" :disabled="savingStates.auditExport" @click="exportAdminAuditLogs">{{ savingStates.auditExport ? '导出中...' : '导出 CSV' }}</button>
        </div>
      </div>
      <div class="toolbar">
        <input v-model.trim="auditLogFilters.q" class="input" placeholder="搜索摘要、订单号、员工账号、租户名">
        <select v-model="auditLogFilters.category" class="input">
          <option value="all">全部分类</option>
          <option v-for="item in auditCategoryOptions" :key="'audit-category-' + item.code" :value="item.code">{{ item.label }}</option>
        </select>
        <select v-model="auditLogFilters.status" class="input">
          <option value="all">全部状态</option>
          <option value="success">成功</option>
          <option value="error">失败</option>
          <option value="warning">告警</option>
          <option value="info">提示</option>
        </select>
        <select v-if="auditScopeOptions.length > 1" v-model="auditLogFilters.scope" class="input">
          <option v-for="item in auditScopeOptions" :key="'audit-scope-' + item.code" :value="item.code">{{ item.label }}</option>
        </select>
        <select v-model.number="auditPagination.page_size" class="input" @change="queryAdminAuditLogs">
          <option v-for="size in auditPageSizeOptions" :key="'audit-page-size-' + size" :value="size">每页 {{ size }} 条</option>
        </select>
        <input v-model="auditLogFilters.date_from" type="date" class="input" aria-label="开始日期">
        <input v-model="auditLogFilters.date_to" type="date" class="input" aria-label="结束日期">
        <button class="solid-btn" @click="queryAdminAuditLogs">查询</button>
        <button class="ghost-btn dark" @click="resetAuditLogFilters">清空筛选</button>
      </div>
      <div class="toolbar-meta">
        <span>已启用筛选 {{ auditLogActiveFilterCount }} 项</span>
        <span>当前页 {{ adminAuditLogs.length }} 条</span>
        <span>{{ adminAuditLastFetchedAt ? ('最近更新 ' + formatDateTime(adminAuditLastFetchedAt)) : '尚未拉取日志' }}</span>
      </div>
      <div class="dashboard-grid secondary">
        <article class="summary-card"><h3>日志总数</h3><strong>{{ adminAuditSummary.total_count }}</strong></article>
        <article class="summary-card"><h3>今日新增</h3><strong>{{ adminAuditSummary.today_count }}</strong></article>
        <article class="summary-card"><h3>成功</h3><strong>{{ adminAuditSummary.success_count }}</strong></article>
        <article class="summary-card" :class="{ 'danger-lite': adminAuditSummary.error_count > 0 }"><h3>失败</h3><strong>{{ adminAuditSummary.error_count }}</strong></article>
        <article class="summary-card">
          <h3>当前页</h3>
          <strong>{{ auditPagination.from_index }} - {{ auditPagination.to_index }}</strong>
          <p>共 {{ auditPagination.total_count }} 条 / 第 {{ auditPagination.page }} 页</p>
        </article>
        <article class="summary-card wide-card">
          <h3>分类分布</h3>
          <div v-if="adminAuditSummary.category_breakdown.length" class="inline-badges">
            <span v-for="item in adminAuditSummary.category_breakdown" :key="'audit-breakdown-' + item.code">{{ item.label }} / {{ item.count }}</span>
          </div>
          <p v-else class="muted-copy">当前筛选条件下还没有分类统计。</p>
        </article>
      </div>
      <div v-if="adminAuditLogs.length" class="log-list">
        <article v-for="log in adminAuditLogs" :key="'audit-log-' + log.id" class="log-item">
          <div class="log-item-head">
            <strong>{{ log.summary || log.action }}</strong>
            <span>{{ log.created_at ? formatDateTime(log.created_at) : '刚刚' }}</span>
          </div>
          <p>{{ log.detail || '该条日志没有补充描述。' }}</p>
          <div class="inline-badges">
            <span>{{ auditCategoryText(log) }}</span>
            <span>{{ auditStatusText(log.status) }}</span>
            <span v-if="log.operator_nickname || log.operator_username">{{ log.operator_nickname || log.operator_username }}</span>
            <span>{{ auditTenantText(log) }}</span>
            <span>{{ auditTargetText(log) }}</span>
          </div>
          <div class="copy-inline">
            <button v-if="log.target_key" class="outline-btn small" @click="copyText(log.target_key, '目标编号已复制')">复制目标编号</button>
            <button class="outline-btn small" @click="openAuditLogTarget(log)">打开目标页</button>
          </div>
        </article>
        <div class="card-actions">
          <button class="outline-btn" :disabled="!auditPagination.has_prev" @click="changeAuditLogPage(auditPagination.page - 1)">上一页</button>
          <span class="muted-copy">第 {{ auditPagination.page }} / {{ auditPagination.total_pages }} 页</span>
          <button class="outline-btn" :disabled="!auditPagination.has_next" @click="changeAuditLogPage(auditPagination.page + 1)">下一页</button>
        </div>
      </div>
      <div v-else class="empty-box">当前筛选条件下还没有操作日志。</div>
    </section>

    <section v-if="adminTab === 'team'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>团队成员与角色权限</h2>
          <p class="section-desc">这里可以给租户开员工子账号，分配订单、物流、团队等不同后台权限。</p>
        </div>
        <div class="hero-actions">
          <button class="outline-btn" :disabled="savingStates.team" @click="fetchTeamMembers">刷新团队</button>
          <button class="solid-btn" @click="openTeamEditor()">新增员工</button>
        </div>
      </div>
      <div class="dashboard-grid secondary">
        <article class="summary-card"><h3>成员总数</h3><strong>{{ teamSummary.total_count }}</strong></article>
        <article class="summary-card"><h3>启用成员</h3><strong>{{ teamSummary.active_count }}</strong></article>
        <article class="summary-card"><h3>停用成员</h3><strong>{{ teamSummary.disabled_count }}</strong></article>
        <article class="summary-card wide-card">
          <h3>角色分布</h3>
          <div v-if="teamSummary.role_breakdown.length" class="inline-badges">
            <span v-for="item in teamSummary.role_breakdown" :key="'team-role-summary-' + item.code">{{ item.label }} / {{ item.count }}</span>
          </div>
          <p v-else class="muted-copy">当前还没有团队角色分布数据。</p>
        </article>
      </div>

      <section v-if="showTeamEditor" class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>{{ teamEditorForm.id ? '编辑员工' : '新增员工' }}</h3>
            <p class="section-desc">密码留空表示不修改，权限会先带出角色默认项，你可以直接按中文名称勾选调整。</p>
          </div>
        </div>
        <div class="admin-form-grid">
          <input v-model.trim="teamEditorForm.username" class="input" placeholder="员工账号">
          <input v-model.trim="teamEditorForm.nickname" class="input" placeholder="员工昵称">
          <input v-model.trim="teamEditorForm.phone" class="input" placeholder="手机号，可选">
          <select v-model="teamEditorForm.role" class="input" @change="onTeamRoleChange">
            <option v-for="role in teamRoleOptions" :key="'team-role-' + role.code" :value="role.code">{{ role.label }}</option>
          </select>
          <select v-model="teamEditorForm.status" class="input">
            <option value="active">启用中</option>
            <option value="disabled">已停用</option>
          </select>
          <div class="permission-picker full-span">
            <div class="permission-picker-head">
              <div>
                <span>员工权限</span>
                <p class="muted-copy">内部仍保存权限代码，但这里直接显示中文名称，不再需要手动输英文。</p>
              </div>
              <button type="button" class="ghost-btn dark small" @click="resetTeamPermissionsToRole">恢复角色默认权限</button>
            </div>
            <div v-if="teamPermissionOptions.length" class="permission-grid">
              <label
                v-for="permission in teamPermissionOptions"
                :key="'team-permission-option-' + permission.code"
                class="permission-option"
                :class="{ active: teamEditorForm.permissions.includes(permission.code) }"
              >
                <input v-model="teamEditorForm.permissions" type="checkbox" :value="permission.code">
                <div>
                  <strong>{{ permissionLabel(permission) }}</strong>
                  <p>{{ permissionDescription(permission) }}</p>
                </div>
              </label>
            </div>
            <p v-else class="muted-copy">当前还没有可选权限，请先刷新团队数据。</p>
            <div v-if="teamEditorForm.permissions.length" class="inline-badges">
              <span v-for="permissionCode in teamEditorForm.permissions" :key="'team-selected-permission-' + permissionCode">{{ permissionLabel(permissionCode) }}</span>
            </div>
          </div>
          <div v-if="teamRoleOptions.find((item) => item.code === teamEditorForm.role)" class="detail-card full-span">
            <span>当前角色说明</span>
            <strong>{{ (teamRoleOptions.find((item) => item.code === teamEditorForm.role) || {}).label }}</strong>
            <p>{{ (teamRoleOptions.find((item) => item.code === teamEditorForm.role) || {}).description || '可按角色自动带出推荐权限。' }}</p>
            <div class="inline-badges">
              <span v-for="permission in ((teamRoleOptions.find((item) => item.code === teamEditorForm.role) || {}).permission_labels || [])" :key="'role-permission-' + permission.code">{{ permissionLabel(permission) }}</span>
            </div>
          </div>
          <div class="password-field">
            <input v-model.trim="teamEditorForm.password" :type="secretInputType('team_member_password')" class="input" :placeholder="teamEditorForm.id ? '新密码，不修改可留空' : '员工密码，至少 6 位'">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('team_member_password')">{{ isSecretFieldVisible('team_member_password') ? '隐藏' : '显示' }}</button>
          </div>
          <div class="password-field">
            <input v-model.trim="teamEditorForm.password_confirm" :type="secretInputType('team_member_password_confirm')" class="input" placeholder="确认员工密码">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('team_member_password_confirm')">{{ isSecretFieldVisible('team_member_password_confirm') ? '隐藏' : '显示' }}</button>
          </div>
        </div>
        <div class="card-actions">
          <button class="outline-btn" @click="closeTeamEditor">取消</button>
          <button class="solid-btn" :disabled="savingStates.team || !isTeamEditorDirty" @click="saveTeamMember">{{ savingStates.team ? '保存中...' : '保存员工' }}</button>
        </div>
      </section>

      <div v-if="adminTeamMembers.length" class="admin-card-grid">
        <article v-for="member in adminTeamMembers" :key="member.id" class="admin-item-card">
          <div class="card-headline">
            <div>
              <span class="mini-badge">{{ member.role_label }}</span>
              <h3>{{ member.nickname || member.username }}</h3>
            </div>
            <span class="status-pill" :class="member.status === 'active' ? 'active' : 'inactive'">{{ member.status === 'active' ? '启用中' : '已停用' }}</span>
          </div>
          <p class="body-copy">{{ member.username }}{{ member.phone ? (' / ' + member.phone) : '' }}</p>
          <p class="muted-copy">{{ member.role_description || '当前角色暂无补充说明。' }}</p>
          <div class="inline-badges">
            <span v-for="permission in member.permission_labels" :key="member.id + '-' + permission.code">{{ permissionLabel(permission) }}</span>
          </div>
          <p class="muted-copy">最后登录：{{ member.last_login_at ? formatDateTime(member.last_login_at) : '暂无记录' }}</p>
          <div class="card-actions">
            <button class="outline-btn" @click="openTeamEditor(member)">编辑</button>
            <button class="outline-btn" :disabled="savingStates.team" @click="toggleTeamMemberStatus(member)">{{ member.status === 'active' ? '停用' : '启用' }}</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-box">当前还没有员工子账号，可以先创建订单专员或客服专员。</div>
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
          <div class="admin-cover" @click="previewImage(planImage(plan))"><img :src="planImage(plan)" :alt="plan.name" loading="lazy" decoding="async"></div>
          <div class="admin-item-body">
            <div class="card-headline">
              <div><span class="mini-badge">{{ plan.badge || '套餐' }}</span><h3>{{ plan.name }}</h3></div>
              <span class="status-pill" :class="plan.status">{{ plan.status === 'active' ? '上架中' : '已下架' }}</span>
            </div>
            <p class="body-copy">{{ plan.best_for || '暂无补充说明' }}</p>
            <div class="pill-row">
              <span class="pill">{{ plan.monthly_price > 0 ? currency(plan.monthly_price) + '/月参考' : '资费以图片为准' }}</span>
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
          <div class="admin-cover" @click="previewImage(deviceImage(device))"><img :src="deviceImage(device)" :alt="device.name" loading="lazy" decoding="async"></div>
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
      <div class="section-head">
        <div>
          <h2>订单管理</h2>
          <p class="section-desc">这里集中处理订单审核、备注、EMS 建单与打印；筛选条件会自动记住，回来后可以继续处理。</p>
        </div>
        <div class="hero-actions">
          <button class="outline-btn" :disabled="savingStates.adminOrders" @click="fetchAdminOrders">{{ savingStates.adminOrders ? '刷新中...' : '刷新订单' }}</button>
          <button class="outline-btn" :disabled="savingStates.exportOrders" @click="exportAdminOrders">{{ savingStates.exportOrders ? '导出中...' : '导出订单' }}</button>
        </div>
      </div>
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
        <button class="ghost-btn dark" @click="resetAdminOrderFilters">重置筛选</button>
      </div>
      <div class="toolbar-meta">
        <span>已启用筛选 {{ adminOrderActiveFilterCount }} 项</span>
        <span>当前结果 {{ adminOrders.length }} 单</span>
        <span>已选 {{ selectedAdminOrderIds.length }} 单</span>
        <span>{{ adminOrdersLastFetchedAt ? ('最近更新 ' + formatDateTime(adminOrdersLastFetchedAt)) : '尚未拉取订单' }}</span>
      </div>
      <div class="batch-toolbar batch-toolbar-lite">
        <label class="switch-line">
          <input type="checkbox" :checked="adminOrders.length && selectedAdminOrderIds.length === adminOrders.length" @change="toggleAllAdminOrders">
          <span>本页全选</span>
        </label>
        <span class="muted-copy">已选 {{ selectedAdminOrderIds.length }} 单</span>
        <button v-if="false" class="solid-btn small" :disabled="savingStates.batchOrders" @click="runBatchAdminAction('workflow')">批量一键处理</button>
        <button v-if="false" class="outline-btn small" :disabled="savingStates.batchOrders" @click="runBatchAdminAction('parse')">批量解析</button>
        <button v-if="false" class="outline-btn small" :disabled="savingStates.batchOrders" @click="runBatchAdminAction('validate')">批量校验</button>
        <button v-if="false" class="outline-btn small" :disabled="savingStates.batchOrders" @click="runBatchAdminAction('create')">批量建单</button>
        <button v-if="false" class="outline-btn small" :disabled="savingStates.batchOrders" @click="runBatchAdminAction('label')">批量取面单</button>
        <button v-if="false" class="outline-btn small" :disabled="savingStates.batchOrders" @click="runBatchAdminAction('print')">批量打印</button>
        <button v-if="false" class="outline-btn small" :disabled="savingStates.batchOrders" @click="runBatchAdminAction('track')">批量查轨迹</button>
        <button class="ghost-btn dark small" :disabled="!selectedAdminOrderIds.length" @click="clearAdminOrderSelection">清空选择</button>
      </div>
      <div v-if="selectedAdminOrderIds.length" class="batch-toolbar quick-action-bar">
        <div class="quick-action-summary">
          <strong>已选 {{ selectedAdminOrderIds.length }} 单订单</strong>
          <span>可直接批量处理物流、更新状态或删除</span>
        </div>
        <div class="quick-action-controls">
          <button class="solid-btn small" :disabled="savingStates.batchOrders || savingStates.deleteOrders" @click="runBatchAdminAction('workflow')">一键处理</button>
          <button class="outline-btn small" :disabled="savingStates.batchOrders || savingStates.deleteOrders" @click="runBatchAdminAction('print')">批量打印</button>
          <button class="outline-btn small" :disabled="savingStates.batchOrders || savingStates.deleteOrders" @click="runBatchAdminAction('track')">同步轨迹</button>
          <select v-model="adminBatchStatus" class="input quick-action-select" :disabled="savingStates.batchOrders || savingStates.deleteOrders">
            <option value="">批量改状态</option>
            <option v-for="status in orderStatuses" :key="'quick-status-' + status" :value="status">{{ orderStatusText(status) }}</option>
          </select>
          <button class="outline-btn small" :disabled="savingStates.batchOrders || savingStates.deleteOrders || !adminBatchStatus" @click="applyBatchOrderStatus">应用状态</button>
          <button class="danger-btn small" :disabled="savingStates.batchOrders || savingStates.deleteOrders" @click="openBatchDeleteAdminOrders">删除订单</button>
        </div>
      </div>
      <div v-if="adminOrders.length" class="order-admin-list">
        <article v-for="order in adminOrders" :key="order.id" class="order-admin-card" :class="{ urgent: isUrgentOrder(order) }">
          <div class="order-topline">
            <div>
              <div class="copy-inline">
                <label class="switch-line">
                  <input type="checkbox" :checked="isAdminOrderSelected(order.id)" @change="toggleAdminOrderSelection(order.id)">
                  <span>选择</span>
                </label>
                <strong>{{ order.order_no }}</strong>
                <button class="outline-btn small" @click="copyText(order.order_no, '订单号已复制')">复制订单号</button>
                <button class="outline-btn small" @click="copyText(order.customer_phone, '手机号已复制')">复制手机号</button>
                <button v-if="order.merchant_tracking_number" class="outline-btn small" @click="copyText(order.merchant_tracking_number, '快递单号已复制')">复制快递单号</button>
              </div>
              <p class="muted-copy">{{ flowTypeText(order.flow_type) }} / {{ order.customer_name }} / {{ order.customer_phone }}</p>
            </div>
            <span class="status-pill" :class="order.status">{{ orderStatusText(order.status) }}</span>
          </div>
          <div v-if="tenantFeatureEnabled('ems')" class="order-overview-strip">
            <article v-for="item in orderEmsSummaryItems(order)" :key="order.id + '-summary-' + item.key" class="order-overview-item" :class="item.tone">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </article>
          </div>
          <div v-if="order.internal_tags && order.internal_tags.length" class="pill-row admin-tag-row">
            <span v-for="tag in order.internal_tags" :key="tag" class="pill">{{ tag }}</span>
          </div>
          <div class="detail-grid">
            <div class="detail-card"><span>套餐信息</span><strong>{{ order.plan_snapshot.name }}</strong><p>{{ order.plan_snapshot.monthly_data || '以套餐图为准' }} / 卡费展示价 {{ currency(orderPlanDisplayAmount(order)) }}<template v-if="orderPlanDiscountAmount(order)"> / 下单减免 {{ currency(orderPlanDiscountAmount(order)) }}</template></p></div>
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
            <strong>寄送设备信息</strong>
            <p>品牌型号：{{ [order.device_submission.brand, order.device_submission.model].filter(Boolean).join(' / ') || '未填' }}</p>
            <p>设备是否可插卡：{{ insertCardText(order.device_submission.can_insert_card) }}</p>
            <p>设备是否已去控：{{ removeControlText(order.device_submission.remove_control) }}</p>
            <p>设备情况：{{ order.device_submission.condition || '未填' }}</p>
            <p>寄出单号：{{ order.device_submission.outbound_tracking || '未填' }}</p>
            <p>寄出快递公司：{{ order.device_submission.outbound_company || '未填' }}</p>
            <p>补充说明：{{ order.device_submission.notes || '未填' }}</p>
          </div>
          <div class="card-actions compact-actions">
            <button class="outline-btn small" @click="copyAdminOrderDispatchInfo(order)">复制代发信息</button>
            <template v-if="isPlatformAdmin && availableDropshipTargets(order).length">
              <select v-model="order._dropship_target_tenant_id" class="input">
                <option value="">选择代发后台</option>
                <option v-for="tenant in availableDropshipTargets(order)" :key="'dropship-' + tenant.id" :value="String(tenant.id)">
                  {{ tenant.name }} ({{ tenant.code }})
                </option>
              </select>
              <button class="solid-btn small" :disabled="isOrderSaving(order.id)" @click="dispatchAdminOrder(order)">一键代发</button>
            </template>
            <span v-if="order.dropship && order.dropship.target_order_no" class="muted-copy">已代发到 {{ order.dropship.target_tenant_name || '目标后台' }} / {{ order.dropship.target_order_no }}</span>
          </div>
          <section v-if="tenantFeatureEnabled('ems')" class="ems-panel">
            <div class="log-head">
              <div>
                <strong>EMS 物流面单</strong>
                <p class="muted-copy">自动解析地址、生成单号、获取面单、打印和同步轨迹。</p>
              </div>
              <div class="pill-row admin-tag-row">
                <span class="pill">运单 {{ trackingNumber(order) || '未生成' }}</span>
                <span class="pill">打印 {{ order.ems.print_status || '未处理' }}</span>
              </div>
            </div>
            <div class="detail-grid ems-detail-grid">
              <div class="detail-card">
                <span>EMS 状态</span>
                <strong>{{ order.ems.reachable_message || '待校验地址' }}</strong>
                <p>{{ order.ems_issue_summary || order.ems.track_summary || order.ems.last_error || '建单后会在这里显示最近一条轨迹或错误信息' }}</p>
                <p v-if="order.ems.last_serial_no" class="muted-copy">流水号：{{ order.ems.last_serial_no }}</p>
              </div>
              <div class="detail-card">
                <span>面单文件</span>
                <strong>{{ order.ems.label_file ? assetFileName(order.ems.label_file, '已生成面单') : '未生成面单' }}</strong>
                <p>{{ order.ems.label_generated_at ? formatDateTime(order.ems.label_generated_at) : '点击获取面单后会生成 PDF 文件' }}</p>
                <div class="copy-inline">
                  <button v-if="order.ems.label_file" class="outline-btn small" @click="openLabelFile(order.ems.label_file)">查看面单</button>
                  <button v-if="trackingNumber(order)" class="outline-btn small" @click="copyText(trackingNumber(order), 'EMS 单号已复制')">复制单号</button>
                  <button v-if="order.cloud_print_download_url" class="outline-btn small" @click="setAdminTab('logistics')">去物流设置</button>
                </div>
              </div>
            </div>
            <div class="dashboard-grid secondary compact-grid">
              <article class="summary-card" :class="orderLogisticsStage(order).tone">
                <h3>当前物流阶段</h3>
                <strong>{{ orderLogisticsStage(order).label }}</strong>
                <p>{{ orderLogisticsStage(order).description || '会根据建单、打印和轨迹自动判断当前阶段。' }}</p>
              </article>
              <article class="summary-card">
                <h3>下一步动作</h3>
                <strong>{{ (order.ems_next_action || {}).label || '待处理' }}</strong>
                <p>{{ (order.ems_next_action || {}).description || '当前订单已进入 EMS 流程。' }}</p>
              </article>
              <article class="summary-card">
                <h3>官方最后回执</h3>
                <strong>{{ (order.ems_last_audit || {}).ret_code || '未记录' }}</strong>
                <p>{{ (order.ems_last_audit || {}).ret_msg || '执行 EMS 接口后会在这里展示最近一次官方返回。' }}</p>
                <p v-if="(order.ems_last_audit || {}).serial_no" class="muted-copy">流水号：{{ order.ems_last_audit.serial_no }}</p>
              </article>
            </div>
            <div class="timeline-strip ems-stage-strip">
              <div v-for="step in emsProcessTimeline(order)" :key="step.key" class="timeline-step" :class="step.state">
                <span>{{ step.label }}</span>
              </div>
            </div>
            <div class="ems-execution-board">
              <article v-for="step in emsExecutionSteps(order)" :key="step.key" class="ems-execution-item" :class="step.status">
                <div class="ems-execution-head">
                  <strong>{{ step.label }}</strong>
                  <span>{{ step.status_text }}</span>
                </div>
                <p>{{ step.message || '等待执行' }}</p>
              </article>
            </div>
            <div class="editor-grid">
              <input v-model.trim="order.ems.receiver.name" class="input" placeholder="收件人">
              <input v-model.trim="order.ems.receiver.mobile" class="input" placeholder="收件手机号">
              <input v-model.trim="order.ems.receiver.prov" class="input" placeholder="收件省">
              <input v-model.trim="order.ems.receiver.city" class="input" placeholder="收件市">
              <input v-model.trim="order.ems.receiver.county" class="input" placeholder="收件区县">
              <input v-model.trim="order.ems.package_weight" class="input" placeholder="重量(g)，默认 500">
              <input v-model.trim="order.ems.ecommerce_user_id" class="input" placeholder="电商用户 ID，可留空自动生成">
              <input v-model.trim="order.ems.biz_product_no" class="input" placeholder="业务产品代码，如 10">
              <input v-model.trim="order.ems.contents_attribute" class="input" placeholder="内件性质，默认 3">
              <input v-model.trim="order.ems.label_type" class="input" placeholder="面单模板，默认 129">
              <input v-model.trim="order.ems.receiver.post_code" class="input" placeholder="收件邮编（可选）">
              <textarea v-model.trim="order.ems.receiver.address" class="input full-span" rows="2" placeholder="收件详细地址"></textarea>
            </div>
            <div class="quick-status-row ems-action-row">
              <button class="solid-btn small" :disabled="isOrderSaving(order.id) || workflowTaskIsActive(order)" @click="queueAdminOrderWorkflow(order)">{{ emsWorkflowButtonText(order) }}</button>
              <button class="outline-btn small" :disabled="isOrderSaving(order.id)" @click="parseAdminOrderAddress(order)">解析地址</button>
              <button class="outline-btn small" :disabled="isOrderSaving(order.id)" @click="validateAdminOrderReachability(order)">可达校验</button>
              <button class="solid-btn small" :disabled="isOrderSaving(order.id)" @click="createAdminOrderWaybill(order)">{{ order.ems.last_error && !order.ems.waybill_no ? '重试建单' : '创建 EMS 单' }}</button>
              <button class="outline-btn small" :disabled="isOrderSaving(order.id)" @click="fetchAdminOrderLabel(order)">{{ order.ems.label_file ? '重新获取面单' : '获取面单' }}</button>
              <button class="outline-btn small" :disabled="isOrderSaving(order.id)" @click="printAdminOrderLabel(order)">{{ order.ems.print_attempted_at ? '重打面单' : '打印面单' }}</button>
              <button v-if="order.ems.label_file" class="outline-btn small" :disabled="isOrderSaving(order.id)" @click="openLabelForManualPrint(order)">打开 PDF 手动打印</button>
              <button v-if="order.ems.print_attempted_at && !order.ems.printed_at" class="outline-btn small" :disabled="isOrderSaving(order.id)" @click="confirmAdminOrderPrinted(order)">确认已打印</button>
              <button class="outline-btn small" :disabled="isOrderSaving(order.id)" @click="syncAdminOrderTracks(order)">{{ order.ems.last_track_sync_at ? '重新同步轨迹' : '刷新轨迹' }}</button>
            </div>
            <div v-if="orderNeedsPrintConfirmation(order)" class="warning-strip print-confirm-strip">
              <strong>面单打印待确认</strong>
              <p>{{ orderPrintConfirmationHint(order) }}</p>
              <div class="copy-inline">
                <button v-if="order.ems.label_file" class="outline-btn small" :disabled="isOrderSaving(order.id)" @click="openLabelForManualPrint(order)">重新打开面单</button>
                <button class="solid-btn small" :disabled="isOrderSaving(order.id)" @click="confirmAdminOrderPrinted(order)">确认已打印</button>
              </div>
            </div>
            <div v-if="order.ems.last_error" class="warning-strip danger-lite ems-error-strip">
              <strong>EMS 提示</strong>
              <p>{{ order.ems.last_error }}</p>
            </div>
            <div class="detail-grid ems-detail-grid">
              <div class="detail-card">
                <span>最后动作</span>
                <strong>{{ order.ems.last_action || '暂无' }}</strong>
                <p>{{ order.ems.last_action_at ? formatDateTime(order.ems.last_action_at) : '执行 EMS 动作后会记录时间' }}</p>
              </div>
              <div class="detail-card">
                <span>轨迹同步</span>
                <strong>{{ formatTrackSyncAge(order.ems.last_track_sync_at) }}</strong>
                <p>{{ order.ems.track_summary || '同步后会显示最近一条物流摘要' }}</p>
              </div>
            </div>
            <div class="copy-inline">
              <button v-if="trackingNumber(order)" class="outline-btn small" @click="openAdminOrderTrackModal(order)">查看完整轨迹</button>
              <button v-if="trackQueryUrl(order)" class="outline-btn small" @click="openTrackingQuery(order)">官网查询</button>
            </div>
            <div v-if="false && order.ems.track_items && order.ems.track_items.length" class="track-inline-list">
              <article v-for="track in reversedTrackItems(order)" :key="track.op_time + track.op_code + track.op_desc" class="track-inline-item">
                <div class="track-inline-head">
                  <strong>{{ track.op_name || track.op_desc || '物流轨迹' }}</strong>
                  <span>{{ track.op_time }}</span>
                </div>
                <p>{{ track.op_desc || '暂无详情' }}</p>
                <span class="muted-copy">{{ [track.op_org_name, track.product_name].filter(Boolean).join(' / ') }}</span>
              </article>
            </div>
            <div v-if="emsAuditLogs(order).length" class="log-panel">
              <div class="log-head">
                <strong>EMS 接口审计</strong>
                <span>{{ emsAuditLogs(order).length }} 条</span>
              </div>
              <div class="log-list">
                <article v-for="log in emsAuditLogs(order).slice(0, 6)" :key="log.time + log.action + log.status" class="log-item">
                  <div class="log-item-head">
                    <strong>{{ log.action || 'ems' }} / {{ log.status === 'error' ? '失败' : '成功' }}</strong>
                    <span>{{ formatDateTime(log.time) }}</span>
                  </div>
                  <p>{{ log.ret_msg || '已记录 EMS 请求与响应' }}</p>
                  <p v-if="log.serial_no" class="muted-copy">流水号：{{ log.serial_no }}</p>
                  <div class="copy-inline">
                    <button v-if="log.request" class="outline-btn small" @click="copyJson(log.request, '请求 JSON 已复制')">复制请求</button>
                    <button v-if="log.response" class="outline-btn small" @click="copyJson(log.response, '响应 JSON 已复制')">复制响应</button>
                  </div>
                </article>
              </div>
            </div>
          </section>
          <section v-else class="log-panel">
            <div class="log-head">
              <strong>EMS 物流面单</strong>
              <span>未开通</span>
            </div>
            <p class="muted-copy">当前租户授权未包含 EMS 电子面单功能。如需自动建单、取面单、打印和轨迹同步，请先升级租户授权。</p>
          </section>
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
          <div class="card-actions">
            <button class="solid-btn" :disabled="isOrderSaving(order.id)" @click="saveAdminOrder(order)">{{ isOrderSaving(order.id) ? '保存中...' : '保存订单处理结果' }}</button>
            <button class="danger-btn" :disabled="isOrderSaving(order.id)" @click="deleteAdminOrder(order)">删除订单</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-box">当前没有符合条件的订单。</div>
    </section>

    <section v-if="adminTab === 'logistics'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>物流设置</h2>
          <p class="section-desc">这里维护 EMS 凭据、默认寄件信息、业务参数、纸张设置和本地打印参数；后台保存值优先，留空时回退服务器环境变量。</p>
        </div>
        <div class="hero-actions">
          <button class="outline-btn" :disabled="savingStates.diagnostics" @click="runEmsDiagnostics">{{ savingStates.diagnostics ? '检测中...' : '运行自检' }}</button>
          <button class="solid-btn" :disabled="savingStates.settings || !isAdminSettingsDirty" @click="saveLogisticsSettings">{{ savingStates.settings ? '保存中...' : '保存物流设置' }}</button>
        </div>
      </div>
      <div class="admin-form-grid">
        <input v-model.trim="adminSettingsForm.logistics.sender_no" class="input" placeholder="EMS 协议客户号">
        <div class="password-field">
          <input v-model.trim="adminSettingsForm.logistics.authorization" :type="secretInputType('logistics_authorization')" class="input" placeholder="EMS 授权码">
          <button type="button" class="password-toggle-btn" @click="toggleSecretField('logistics_authorization')">{{ isSecretFieldVisible('logistics_authorization') ? '隐藏' : '显示' }}</button>
        </div>
        <div class="password-field">
          <input v-model.trim="adminSettingsForm.logistics.sign_key" :type="secretInputType('logistics_sign_key')" class="input" placeholder="EMS 签名钥匙 Base64">
          <button type="button" class="password-toggle-btn" @click="toggleSecretField('logistics_sign_key')">{{ isSecretFieldVisible('logistics_sign_key') ? '隐藏' : '显示' }}</button>
        </div>
        <div class="warning-strip full-span">
          <strong>凭据优先级</strong>
          <p>这里填写的客户号 / 授权码 / 签名钥匙会优先使用；对应字段留空时，系统自动回退到服务器环境变量。</p>
        </div>
        <input v-model.trim="adminSettingsForm.logistics.sender_name" class="input" placeholder="寄件人姓名">
        <input v-model.trim="adminSettingsForm.logistics.sender_phone" class="input" placeholder="寄件人手机号">
        <input v-model.trim="adminSettingsForm.logistics.sender_post_code" class="input" placeholder="寄件邮编（可选）">
        <input v-model.trim="adminSettingsForm.logistics.preferred_printer" class="input" placeholder="默认打印机名称">
        <input v-model.trim="adminSettingsForm.logistics.sender_prov" class="input" placeholder="寄件省">
        <input v-model.trim="adminSettingsForm.logistics.sender_city" class="input" placeholder="寄件市">
        <input v-model.trim="adminSettingsForm.logistics.sender_county" class="input" placeholder="寄件区县">
        <select v-model="adminSettingsForm.logistics.preferred_print_mode" class="input">
          <option value="auto">自动优先静默打印</option>
          <option value="sumatra">仅 SumatraPDF</option>
          <option value="powershell">仅 PowerShell</option>
          <option value="open">打开文件手动打印</option>
          <option value="browser">浏览器打印</option>
        </select>
        <textarea v-model.trim="adminSettingsForm.logistics.sender_address" class="input full-span" rows="2" placeholder="寄件详细地址"></textarea>
        <input v-model.trim="adminSettingsForm.logistics.biz_product_no" class="input" placeholder="默认业务产品代码">
        <input v-model.trim="adminSettingsForm.logistics.biz_product_id" class="input" placeholder="默认业务产品 ID（可选）">
        <input v-model.trim="adminSettingsForm.logistics.contents_attribute" class="input" placeholder="默认内件性质">
        <input v-model.trim="adminSettingsForm.logistics.default_weight_grams" class="input" placeholder="默认重量(g)">
        <input v-model.trim="adminSettingsForm.logistics.label_type" class="input" placeholder="默认面单模板">
        <input v-model.trim="adminSettingsForm.logistics.sumatra_path" class="input full-span" placeholder="SumatraPDF.exe 本地完整路径，可留空自动探测">
        <input v-model.trim="adminSettingsForm.logistics.paper_name" class="input" placeholder="期望纸张名称，如 100x180mm">
        <input v-model.trim="adminSettingsForm.logistics.paper_width_mm" class="input" placeholder="纸张宽(mm)">
        <input v-model.trim="adminSettingsForm.logistics.paper_height_mm" class="input" placeholder="纸张高(mm)">
        <input v-model.number="adminSettingsForm.logistics.track_auto_sync_interval_hours" type="number" min="1" class="input" placeholder="轨迹自动同步间隔(小时)">
        <input v-model.number="adminSettingsForm.logistics.track_stale_hours" type="number" min="1" class="input" placeholder="轨迹多久视为待同步">
        <input v-model.number="adminSettingsForm.logistics.payment_review_alert_hours" type="number" min="1" class="input" placeholder="待审核告警阈值(小时)">
        <input v-model.number="adminSettingsForm.logistics.ready_to_ship_alert_hours" type="number" min="1" class="input" placeholder="待发货告警阈值(小时)">
        <input v-model.number="adminSettingsForm.logistics.auto_track_sync_fail_alert_threshold" type="number" min="1" class="input" placeholder="自动同步失败告警次数">
        <input v-model.number="adminSettingsForm.logistics.print_failure_alert_threshold" type="number" min="1" class="input" placeholder="打印失败告警次数">
        <input v-model.trim="adminSettingsForm.logistics.track_query_url_template" class="input full-span" placeholder="物流官网查询模板，例如 https://example.com/query?mailNo={tracking_number}">
        <label class="switch-line full-span"><input type="checkbox" v-model="adminSettingsForm.logistics.auto_sync_tracks"><span>开启 EMS 轨迹后台自动同步</span></label>
        <p class="muted-copy full-span">开启后，服务端会按上面的间隔自动同步已出单订单的 EMS 轨迹，用户端订单页会更快看到最新状态。</p>
      </div>
      <section class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>打印与环境自检</h3>
            <p class="section-desc">用于快速确认 EMS 凭证、默认打印机、SumatraPDF、C-Lodop、纸张配置以及打印前拦截项是否正常。</p>
          </div>
        </div>
        <div v-if="adminEmsDiagnostics" class="detail-grid">
          <div class="detail-card">
            <span>凭证状态</span>
            <strong>{{ adminEmsDiagnostics.credentials.sender_no_configured && adminEmsDiagnostics.credentials.authorization_configured && adminEmsDiagnostics.credentials.sign_key_configured ? '已配置' : '未完整配置' }}</strong>
            <p>优先读取当前物流设置，留空时自动回退到服务器环境变量。</p>
          </div>
          <div class="detail-card">
            <span>打印模式</span>
            <strong>{{ adminEmsDiagnostics.runtime.print_mode || '未设置' }}</strong>
            <p>{{ adminEmsDiagnostics.runtime.printer_name || '未设置默认打印机' }}</p>
          </div>
          <div class="detail-card">
            <span>SumatraPDF</span>
            <strong>{{ adminEmsDiagnostics.diagnostics.sumatra.available ? '已检测到' : '未检测到' }}</strong>
            <p>{{ adminEmsDiagnostics.diagnostics.sumatra.path || '可在上方填写本地程序路径' }}</p>
          </div>
          <div class="detail-card">
            <span>C-Lodop</span>
            <strong>{{ adminEmsDiagnostics.diagnostics.cloudPrint.reachable ? '本机服务可达' : '未连接' }}</strong>
            <p>{{ adminEmsDiagnostics.diagnostics.cloudPrint.url || '如需检测，可先安装官方云打印控件' }}</p>
          </div>
          <div class="detail-card">
            <span>纸张期望</span>
            <strong>{{ adminEmsDiagnostics.runtime.paper_name || '未设置' }}</strong>
            <p>{{ adminEmsDiagnostics.runtime.paper_width_mm }} x {{ adminEmsDiagnostics.runtime.paper_height_mm }} mm / {{ adminEmsDiagnostics.diagnostics.paper?.match === true ? '已匹配' : (adminEmsDiagnostics.diagnostics.paper?.match === false ? '未匹配' : '待确认') }}</p>
          </div>
          <div class="detail-card">
            <span>检测到的打印机</span>
            <strong>{{ adminEmsDiagnostics.diagnostics.matchedPrinter ? adminEmsDiagnostics.diagnostics.matchedPrinter.name : '未匹配默认打印机' }}</strong>
            <p>{{ adminEmsDiagnostics.diagnostics.printerConfiguration?.paperSize || '未读取到纸张配置' }}</p>
          </div>
          <div class="detail-card">
            <span>打印预检</span>
            <strong>{{ adminEmsDiagnostics.diagnostics.preflight?.ok ? '通过' : '需处理' }}</strong>
            <p>{{ adminEmsDiagnostics.diagnostics.preflight?.ok ? '当前配置可以继续打印。' : '存在会拦截自动打印的问题，请先处理后再发起打印。' }}</p>
          </div>
        </div>
        <div v-if="adminEmsDiagnostics && adminEmsDiagnostics.diagnostics.printers && adminEmsDiagnostics.diagnostics.printers.length" class="inline-badges">
          <span v-for="printer in adminEmsDiagnostics.diagnostics.printers" :key="printer.name">{{ printer.name }} / {{ printer.driverName || '未知驱动' }}</span>
        </div>
        <div v-if="adminEmsDiagnostics && adminEmsDiagnostics.diagnostics.preflight && !adminEmsDiagnostics.diagnostics.preflight.ok" class="warning-strip danger-lite">
          <strong>打印拦截项</strong>
          <p v-for="reason in adminEmsDiagnostics.diagnostics.preflight.blockingReasons" :key="reason">{{ reason }}</p>
        </div>
        <div v-if="adminEmsDiagnostics && adminEmsDiagnostics.diagnostics.warnings && adminEmsDiagnostics.diagnostics.warnings.length" class="warning-strip danger-lite">
          <strong>自检提示</strong>
          <p v-for="warning in adminEmsDiagnostics.diagnostics.warnings" :key="warning">{{ warning }}</p>
        </div>
        <div class="copy-inline">
          <button v-if="adminEmsDiagnostics?.cloud_print_download_url" class="outline-btn small" @click="openLabelFile(adminEmsDiagnostics.cloud_print_download_url)">下载官方云打印控件</button>
          <button v-if="adminEmsDiagnostics?.diagnostics" class="outline-btn small" @click="copyJson(adminEmsDiagnostics.diagnostics, '诊断结果已复制')">复制诊断 JSON</button>
        </div>
      </section>
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
        <textarea v-model.trim="adminSettingsForm.buy_flow_steps_text" class="input full-span" rows="4" placeholder="购买设备配卡流程，一行一条"></textarea>
        <textarea v-model.trim="adminSettingsForm.ship_flow_steps_text" class="input full-span" rows="4" placeholder="寄设备配卡流程，一行一条"></textarea>
        <textarea v-model.trim="adminSettingsForm.ship_checklist_text" class="input full-span" rows="4" placeholder="寄设备检查清单，一行一条"></textarea>
        <textarea v-model.trim="adminSettingsForm.purchase_rules_text" class="input full-span" rows="4" placeholder="购买须知，一行一条"></textarea>
        <textarea v-model.trim="adminSettingsForm.faq_items_text" class="input full-span" rows="5" placeholder="常见问题，一行一条，格式：问题|答案"></textarea>
        <textarea v-model.trim="adminSettingsForm.admin_note_templates_text" class="input full-span" rows="4" placeholder="后台备注模板，一行一条"></textarea>
        <input v-model.trim="adminSettingsForm.share_title" class="input" placeholder="分享标题">
        <input v-model.trim="adminSettingsForm.share_description" class="input" placeholder="分享描述">
      </div>
      <div class="qr-grid">
        <article class="qr-card">
          <h3>微信收款码</h3>
          <div class="qr-preview" @click="settings.payment_qrs.wechat && previewImage(settings.payment_qrs.wechat)">
            <img v-if="settings.payment_qrs.wechat" :src="encodedImage(settings.payment_qrs.wechat)" alt="微信收款码" loading="lazy" decoding="async">
            <div v-else class="qr-empty">暂未上传</div>
          </div>
          <label class="upload-field" :class="{ 'has-file': qrFiles.wechat || settings.payment_qrs.wechat }">
            <input class="upload-input" type="file" accept="image/*" @change="onQrFileChange($event, 'wechat')">
            <span class="upload-meta">
              <span class="upload-title">上传微信收款码</span>
              <span class="upload-hint">{{ qrFiles.wechat ? '已选择新图片，保存后会替换当前收款码，并自动压缩为 WebP' : (settings.payment_qrs.wechat ? '当前已配置收款码，可重新选择替换；新图会自动压缩为 WebP' : '支持 JPG、PNG，建议上传清晰方形二维码，系统会自动压缩为 WebP') }}</span>
              <span class="upload-filename">{{ qrFiles.wechat ? qrFiles.wechat.name : assetFileName(settings.payment_qrs.wechat, '暂未选择图片') }}</span>
            </span>
            <span class="upload-trigger">{{ qrFiles.wechat ? '重新选择' : '选择图片' }}</span>
          </label>
        </article>
        <article class="qr-card">
          <h3>支付宝收款码</h3>
          <div class="qr-preview" @click="settings.payment_qrs.alipay && previewImage(settings.payment_qrs.alipay)">
            <img v-if="settings.payment_qrs.alipay" :src="encodedImage(settings.payment_qrs.alipay)" alt="支付宝收款码" loading="lazy" decoding="async">
            <div v-else class="qr-empty">暂未上传</div>
          </div>
          <label class="upload-field" :class="{ 'has-file': qrFiles.alipay || settings.payment_qrs.alipay }">
            <input class="upload-input" type="file" accept="image/*" @change="onQrFileChange($event, 'alipay')">
            <span class="upload-meta">
              <span class="upload-title">上传支付宝收款码</span>
              <span class="upload-hint">{{ qrFiles.alipay ? '已选择新图片，保存后会替换当前收款码，并自动压缩为 WebP' : (settings.payment_qrs.alipay ? '当前已配置收款码，可重新选择替换；新图会自动压缩为 WebP' : '支持 JPG、PNG，建议上传清晰方形二维码，系统会自动压缩为 WebP') }}</span>
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
          <div class="password-field">
            <input v-model.trim="adminAccountForm.current_password" :type="secretInputType('admin_account_current_password')" class="input" placeholder="当前密码">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('admin_account_current_password')">{{ isSecretFieldVisible('admin_account_current_password') ? '隐藏' : '显示' }}</button>
          </div>
          <div class="password-field">
            <input v-model.trim="adminAccountForm.new_password" :type="secretInputType('admin_account_new_password')" class="input" placeholder="新密码，不修改可留空">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('admin_account_new_password')">{{ isSecretFieldVisible('admin_account_new_password') ? '隐藏' : '显示' }}</button>
          </div>
          <div class="password-field">
            <input v-model.trim="adminAccountForm.confirm_password" :type="secretInputType('admin_account_confirm_password')" class="input" placeholder="确认新密码">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('admin_account_confirm_password')">{{ isSecretFieldVisible('admin_account_confirm_password') ? '隐藏' : '显示' }}</button>
          </div>
        </div>
        <div class="card-actions">
          <button class="solid-btn" :disabled="savingStates.account || !isAdminAccountDirty" @click="saveAdminAccount">{{ savingStates.account ? '保存中...' : '保存账号安全设置' }}</button>
        </div>
      </section>
    </section>

    <section v-if="adminTab === 'account'" class="admin-panel">
      <div class="section-head">
        <div>
          <h2>账号安全</h2>
          <p class="section-desc">这里单独维护当前后台账号的登录名和密码，方便给不同角色分开授权。</p>
        </div>
      </div>
      <section class="account-panel">
        <div class="section-head compact-head">
          <div>
            <h3>修改登录账号</h3>
            <p class="section-desc">请先输入当前密码，再保存新的账号或密码。</p>
          </div>
        </div>
        <div class="admin-form-grid">
          <input v-model.trim="adminAccountForm.username" class="input" placeholder="管理员账号">
          <div class="password-field">
            <input v-model.trim="adminAccountForm.current_password" :type="secretInputType('admin_account_current_password')" class="input" placeholder="当前密码">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('admin_account_current_password')">{{ isSecretFieldVisible('admin_account_current_password') ? '隐藏' : '显示' }}</button>
          </div>
          <div class="password-field">
            <input v-model.trim="adminAccountForm.new_password" :type="secretInputType('admin_account_new_password')" class="input" placeholder="新密码，不修改可留空">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('admin_account_new_password')">{{ isSecretFieldVisible('admin_account_new_password') ? '隐藏' : '显示' }}</button>
          </div>
          <div class="password-field">
            <input v-model.trim="adminAccountForm.confirm_password" :type="secretInputType('admin_account_confirm_password')" class="input" placeholder="确认新密码">
            <button type="button" class="password-toggle-btn" @click="toggleSecretField('admin_account_confirm_password')">{{ isSecretFieldVisible('admin_account_confirm_password') ? '隐藏' : '显示' }}</button>
          </div>
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
        <div class="password-field">
          <input v-model.trim="adminPassword" :type="secretInputType('admin_login_password')" class="input" placeholder="请输入管理员密码" @keyup.enter="login">
          <button type="button" class="password-toggle-btn" @click="toggleSecretField('admin_login_password')">{{ isSecretFieldVisible('admin_login_password') ? '隐藏' : '显示' }}</button>
        </div>
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
        <p class="muted-copy">先选方案，再填信息，最后扫码付款并上传截图。</p>
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
          <strong class="builder-mobile-summary-price">{{ currency(orderTotal) }}</strong>
          <strong>{{ selectedPlan ? selectedPlan.name : '请先选择套餐' }}</strong>
          <p class="builder-mobile-summary-step">当前步骤：{{ builderCurrentStepLabel }}</p>
          <p v-if="builderForm.flow_type === 'buy_device'">{{ selectedDevice ? selectedDevice.name + ' × ' + builderForm.quantity : '请先选择设备' }}</p>
          <p v-else>{{ builderForm.customer_device_brand || builderForm.customer_device_model ? '设备信息已开始填写，继续补完并付款即可提交。' : '先选套餐，再补设备信息和付款截图。' }}</p>
        </div>
        <div class="builder-progress-strip">
          <button
            v-for="item in builderStepItems"
            :key="item.key"
            type="button"
            class="builder-progress-pill"
            :class="[item.state, { active: builderMobileStep === item.index }]"
            @click="goBuilderMobileStep(item.index)"
          >
            {{ item.index }} {{ item.label }}
          </button>
        </div>

        <section v-if="builderForm.flow_type === 'ship_device' && isBuilderStepVisible('plan')" class="builder-section">
          <div class="builder-title"><h4>1. 选择套餐</h4><span>必填</span></div>
          <div class="builder-filter-strip" v-if="builderPlanCarrierOptions.length">
            <span class="builder-filter-label">套餐分类</span>
            <div class="pill-choice-row builder-carrier-row">
              <button
                v-for="option in builderPlanCarrierOptions"
                :key="'ship-carrier-' + option.code"
                type="button"
                class="pill-choice builder-carrier-pill"
                :class="{ active: builderPlanCarrierFilter === option.code }"
                :disabled="option.disabled"
                @click="setBuilderPlanCarrierFilter(option.code)"
              >
                <span>{{ option.label }}</span>
                <em>{{ option.count }}</em>
              </button>
            </div>
          </div>
          <div v-if="filteredAvailablePlansForBuilder.length" class="builder-choice-grid">
            <button v-for="plan in filteredAvailablePlansForBuilder" :key="plan.id" class="choice-card" :class="{ selected: builderForm.plan_id === plan.id }" @click="builderForm.plan_id = plan.id">
              <div class="choice-media"><img :src="planImage(plan)" :alt="plan.name" loading="lazy" decoding="async"></div>
              <strong>{{ plan.name }}</strong>
              <span>{{ plan.monthly_data || '以图片说明为准' }}</span>
              <span>{{ normalizePlanCarrier(plan.carrier) }} / {{ plan.network_type || '4G/5G' }}</span>
              <span>{{ plan.setup_price > 0 ? '配卡费 ' + currency(plan.setup_price) : '资费以图片为准' }}</span>
            </button>
          </div>
          <div v-else class="empty-box compact-empty">{{ availablePlansForBuilder.length ? '当前分类下暂无套餐，请切换移动、联通、电信或广电分类查看。' : '暂时没有可选套餐，请稍后再试或联系管理员。' }}</div>
        </section>
        <section v-if="builderForm.flow_type === 'buy_device' && isBuilderStepVisible('device')" class="builder-section">
          <div class="builder-title"><h4>1. 先选择设备</h4><span>必填</span></div>
          <div class="builder-choice-grid">
            <button v-for="device in devices" :key="device.id" class="choice-card" :class="{ selected: builderForm.device_id === device.id }" @click="chooseDevice(device.id)" :disabled="device.stock <= 0">
              <div class="choice-media"><img :src="deviceImage(device)" :alt="device.name" loading="lazy" decoding="async"></div>
              <strong>{{ device.name }}</strong>
              <span>{{ device.model }} / {{ deviceCategoryText(device.category) }}</span>
              <span>{{ deviceCompatibilityText(device) }}</span>
              <span>{{ device.stock > 0 ? currency(device.price) : '暂时缺货' }}</span>
            </button>
          </div>
          <div class="quantity-row">
            <span>购买数量</span>
            <div class="counter">
              <button type="button" class="counter-btn" aria-label="减少购买数量" @click="changeQuantity(-1)">-</button>
              <strong>{{ builderForm.quantity }}</strong>
              <button type="button" class="counter-btn" aria-label="增加购买数量" @click="changeQuantity(1)">+</button>
            </div>
          </div>
        </section>
        <section v-if="builderForm.flow_type === 'buy_device' && isBuilderStepVisible('plan')" class="builder-section">
          <div class="builder-title"><h4>2. 再选择可配套餐</h4><span>按设备自动筛选</span></div>
          <div class="builder-filter-strip" v-if="builderPlanCarrierOptions.length">
            <span class="builder-filter-label">套餐分类</span>
            <div class="pill-choice-row builder-carrier-row">
              <button
                v-for="option in builderPlanCarrierOptions"
                :key="'buy-carrier-' + option.code"
                type="button"
                class="pill-choice builder-carrier-pill"
                :class="{ active: builderPlanCarrierFilter === option.code }"
                :disabled="option.disabled"
                @click="setBuilderPlanCarrierFilter(option.code)"
              >
                <span>{{ option.label }}</span>
                <em>{{ option.count }}</em>
              </button>
            </div>
          </div>
          <div v-if="filteredAvailablePlansForBuilder.length" class="builder-choice-grid">
            <button v-for="plan in filteredAvailablePlansForBuilder" :key="plan.id" class="choice-card" :class="{ selected: builderForm.plan_id === plan.id }" @click="builderForm.plan_id = plan.id">
              <div class="choice-media"><img :src="planImage(plan)" :alt="plan.name" loading="lazy" decoding="async"></div>
              <strong>{{ plan.name }}</strong>
              <span>{{ plan.monthly_data || '以图片说明为准' }}</span>
              <span>{{ normalizePlanCarrier(plan.carrier) }} / {{ plan.network_type || '4G/5G' }}</span>
              <span>{{ plan.setup_price > 0 ? '配卡费 ' + currency(plan.setup_price) : '资费以图片为准' }}</span>
            </button>
          </div>
          <div v-else class="empty-box compact-empty">{{ availablePlansForBuilder.length ? '当前分类下暂无可搭配套餐，请切换移动、联通、电信或广电分类查看。' : '这台设备暂时没有可搭配的上架套餐，请更换设备或联系客服处理。' }}</div>
        </section>

        <section v-if="isBuilderStepVisible('contact')" class="builder-section">
          <div class="builder-title"><h4>{{ builderForm.flow_type === 'buy_device' ? '3. 联系人与收货信息' : '2. 联系人与回寄信息' }}</h4><span>必填</span></div>
          <div class="admin-form-grid">
            <input v-model.trim="builderForm.customer_name" class="input" placeholder="联系人姓名">
            <input v-model.trim="builderForm.customer_phone" class="input" placeholder="手机号码">
            <textarea v-model.trim="builderForm.shipping_address" class="input full-span" rows="3" :placeholder="builderForm.flow_type === 'buy_device' ? '收货地址' : '回寄地址'"></textarea>
            <details class="builder-optional-panel full-span">
              <summary>备注和特殊要求（选填）</summary>
              <div class="builder-optional-body">
                <textarea v-model.trim="builderForm.remark" class="input full-span" rows="3" placeholder="例如收货时间、设备用途、特殊备注"></textarea>
              </div>
            </details>
          </div>
        </section>

        <section v-if="builderForm.flow_type === 'ship_device' && isBuilderStepVisible('ship_device')" class="builder-section">
          <div class="builder-title"><h4>3. 填写寄送设备信息</h4><span>品牌或型号至少填一个</span></div>
          <div class="warning-strip danger-lite compact-builder-tip">
            <strong>寄设备前先确认卡槽情况</strong>
            <p>如需我们到件后继续处理，请在下方补充说明里写清楚，避免耽误配卡进度。</p>
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
            <details class="builder-optional-panel full-span">
              <summary>补充寄送信息（选填）</summary>
              <div class="builder-optional-body">
                <input v-model.trim="builderForm.customer_device_outbound_company" class="input full-span" placeholder="你寄给商家的快递公司">
                <input v-model.trim="builderForm.customer_device_tracking" class="input full-span" placeholder="你寄给商家的快递单号">
                <textarea v-model.trim="builderForm.customer_device_condition" class="input full-span" rows="3" placeholder="设备当前情况，例如是否能开机、是否能联网、是否需要刷机等"></textarea>
                <textarea v-model.trim="builderForm.customer_device_notes" class="input full-span" rows="3" placeholder="其他补充说明（可选）"></textarea>
              </div>
            </details>
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
        <section class="summary-card builder-order-summary">
          <div class="builder-title"><h4>订单确认</h4><span>实时计算</span></div>
          <div class="summary-row"><span>下单方式</span><strong>{{ flowTypeText(builderForm.flow_type) }}</strong></div>
          <div class="summary-row"><span>所选套餐</span><strong>{{ selectedPlan ? selectedPlan.name : '请先选择套餐' }}</strong></div>
          <div class="summary-row" v-if="builderForm.flow_type === 'buy_device'"><span>所选设备</span><strong>{{ selectedDevice ? selectedDevice.name + ' × ' + builderForm.quantity : '请先选择设备' }}</strong></div>
          <div class="summary-row"><span>套餐卡费展示价</span><strong>{{ currency(planDisplayAmount(selectedPlan)) }}</strong></div>
          <div class="summary-row" v-if="planSettlementDiscount(selectedPlan) > 0"><span>卡费减免</span><strong>-{{ currency(planSettlementDiscount(selectedPlan)) }}</strong></div>
          <div class="summary-row" v-if="builderForm.flow_type === 'buy_device'"><span>设备金额</span><strong>{{ currency(builderForm.flow_type === 'buy_device' && selectedDevice ? selectedDevice.price * builderForm.quantity : 0) }}</strong></div>
          <div class="summary-row" v-if="builderForm.flow_type === 'ship_device'"><span>{{ settings.ship_service_title || '寄设备配卡服务费' }}</span><strong>{{ currency(settings.ship_service_fee || 0) }}</strong></div>
          <div class="summary-row total"><span>应付合计</span><strong>{{ currency(orderTotal) }}</strong></div>
        </section>

        <section v-if="!isCompactMobile || isBuilderStepVisible('payment')" class="summary-card builder-payment-panel">
          <div class="builder-title"><h4>4. 扫码付款并上传截图</h4><span>最后一步</span></div>
          <div class="warning-strip">
            <strong>付款完成后上传截图即可</strong>
            <p>后台会按截图开始审核，不需要重复提交。</p>
          </div>
          <div class="payment-switch">
            <button class="tab-btn" :class="{ active: builderForm.payment_method === 'wechat' }" @click="builderForm.payment_method = 'wechat'">微信付款</button>
            <button class="tab-btn" :class="{ active: builderForm.payment_method === 'alipay' }" @click="builderForm.payment_method = 'alipay'">支付宝付款</button>
          </div>
          <div class="qr-preview large" @click="activePaymentQr && previewImage(activePaymentQr)">
            <img v-if="activePaymentQr" :src="encodedImage(activePaymentQr)" :alt="paymentText(builderForm.payment_method)" loading="lazy" decoding="async">
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
              <span class="upload-hint">{{ paymentProofFile ? '付款截图已选中，提交订单时会一并上传并自动压缩' : '付款完成后上传截图，支持微信或支付宝付款凭证，系统会自动压缩为 WebP/AVIF' }}</span>
              <span class="upload-filename">{{ paymentProofFile ? paymentProofFile.name : '暂未选择截图' }}</span>
            </span>
            <span class="upload-trigger">{{ paymentProofFile ? '重新选择' : '选择截图' }}</span>
          </label>
          <img v-if="paymentProofPreview" :src="paymentProofPreview" class="proof-preview" alt="付款截图预览">
          <button class="solid-btn wide-btn builder-payment-submit" :disabled="savingStates.submitOrder" @click="submitOrder">{{ savingStates.submitOrder ? '提交中...' : '上传截图并提交订单' }}</button>
        </section>
      </aside>
      <div class="builder-submit-bar">
        <button v-if="isCompactMobile" type="button" class="outline-btn builder-submit-secondary" @click="goBuilderPrevStep">{{ builderMobileBackActionText }}</button>
        <div class="builder-submit-copy">
          <span>应付合计</span>
          <strong>{{ currency(orderTotal) }}</strong>
          <p>{{ builderCurrentStepLabel }}</p>
        </div>
        <button class="solid-btn" :disabled="savingStates.submitOrder" @click="handleBuilderPrimaryAction">{{ builderMobilePrimaryActionText }}</button>
      </div>
    </div>
  </div>
</div>

<div v-if="showShipAddressPrompt" class="overlay" @click.self="closeShipAddressPrompt">
  <div class="modal-card">
    <div class="modal-head">
      <div>
        <h3>请把设备寄到商家地址</h3>
        <p class="muted-copy">寄设备配卡订单提交成功后，请按下面地址寄出设备，避免漏看页面底部提示。</p>
      </div>
      <button class="icon-btn" @click="closeShipAddressPrompt">×</button>
    </div>
    <div class="modal-body">
      <div class="warning-strip">
        <strong>订单 {{ shipAddressPromptOrderNo || '已提交' }}</strong>
        <p>寄出后可在“我的订单”里补填快递公司和单号，商家会更快看到。</p>
      </div>
      <div class="address-card">
        <div>
          <span>商家收件信息</span>
          <strong>{{ settings.shop_receiving_name || '收件人未设置' }}</strong>
          <p>{{ shopReceivingText || '后台暂未配置收件地址' }}</p>
        </div>
      </div>
      <div class="card-actions">
        <button class="outline-btn" @click="copyText(shopReceivingText, '收件地址已复制')">复制地址</button>
        <button class="solid-btn" @click="openShipAddressPromptOrders">去我的订单</button>
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
      <div v-if="myOrderReminderCenterItems.length" class="user-notice-banner">
        <div>
          <span>订单提醒</span>
          <strong>{{ myOrdersUnreadNoticeCount }} 条未读提醒</strong>
          <p>{{ myOrderReminderSummary.orderCount }} 个订单有未读消息，页面打开时会每 60 秒自动刷新一次。</p>
        </div>
        <div class="contact-actions">
          <button class="solid-btn small" :disabled="!myOrdersUnreadNoticeCount" @click="markAllMyOrdersNoticesRead">全部标记已读</button>
          <button class="outline-btn small" @click="fetchMyOrders(true, { suppressNoticeToast: true })">立即刷新</button>
        </div>
      </div>
      <details v-if="myOrderReminderCenterItems.length && isCompactMobile" class="mobile-fold-card user-reminder-center mobile-order-fold">
        <summary class="mobile-fold-summary">提醒中心（{{ myOrderReminderCenterItems.length }} 条）</summary>
        <div class="user-reminder-center-list mobile-fold-body">
          <article v-for="item in myOrderReminderCenterItems" :key="item.id" class="user-reminder-item" :class="[item.level, { unread: !item.read_at }]">
            <div class="user-reminder-item-head">
              <strong>{{ item.title }}</strong>
              <span>{{ formatDateTime(item.created_at) }}</span>
            </div>
            <p>{{ item.order_no }} / {{ item.message }}</p>
            <span class="muted-copy">{{ item.read_at ? '已读时间：' + formatDateTime(item.read_at) : '未读提醒' }}</span>
          </article>
        </div>
      </details>
      <section v-else-if="myOrderReminderCenterItems.length" class="user-reminder-center">
        <div class="section-head compact-head">
          <div>
            <h3>提醒中心</h3>
            <p class="muted-copy">{{ myOrderReminderSummary.latestTime ? '最新提醒：' + formatDateTime(myOrderReminderSummary.latestTime) : '会集中展示订单物流提醒历史' }}</p>
          </div>
        </div>
        <div class="user-reminder-center-list">
          <article v-for="item in myOrderReminderCenterItems" :key="item.id" class="user-reminder-item" :class="[item.level, { unread: !item.read_at }]">
            <div class="user-reminder-item-head">
              <strong>{{ item.title }}</strong>
              <span>{{ formatDateTime(item.created_at) }}</span>
            </div>
            <p>{{ item.order_no }} / {{ item.message }}</p>
            <span class="muted-copy">{{ item.read_at ? '已读时间：' + formatDateTime(item.read_at) : '未读提醒' }}</span>
          </article>
        </div>
      </section>
      <div v-if="myOrders.length" class="order-list">
        <article v-for="order in myOrders" :key="order.id" class="order-card">
          <div class="order-topline">
            <div>
              <div class="copy-inline">
                <strong>{{ order.order_no }}</strong>
                <button class="outline-btn small" @click="copyText(order.order_no, '订单号已复制')">复制订单号</button>
                <span v-if="userOrderUnreadNoticeCount(order)" class="notice-pill unread">未读 {{ userOrderUnreadNoticeCount(order) }}</span>
              </div>
              <p class="muted-copy">{{ formatDateTime(order.created_at) }} / {{ flowTypeText(order.flow_type) }}</p>
              <div class="inline-badges">
                <span class="status-pill" :class="orderLogisticsStage(order).tone">{{ orderLogisticsStage(order).label }}</span>
              </div>
            </div>
            <span class="status-pill" :class="order.status">{{ orderStatusText(order.status) }}</span>
          </div>
          <div class="timeline-strip">
            <div v-for="step in orderTimeline(order)" :key="step.key" class="timeline-step" :class="step.state">
              <span>{{ step.label }}</span>
            </div>
          </div>
          <div v-if="isCompactMobile" class="order-overview-strip mobile-order-overview-strip">
            <article class="order-overview-item" :class="order.status === 'completed' ? 'success' : (order.status === 'cancelled' ? 'danger' : orderLogisticsStage(order).tone)">
              <span>订单状态</span>
              <strong>{{ orderStatusText(order.status) }}</strong>
            </article>
            <article class="order-overview-item" :class="trackingNumber(order) ? 'success' : 'muted'">
              <span>EMS 单号</span>
              <strong>{{ trackingNumber(order) || '待生成' }}</strong>
            </article>
            <article class="order-overview-item" :class="orderLogisticsStage(order).tone">
              <span>最新进度</span>
              <strong>{{ userTrackHeadline(order) }}</strong>
            </article>
          </div>
          <p v-if="isCompactMobile" class="mobile-order-summary-note">{{ userTrackDescription(order) }}</p>
          <div v-if="isCompactMobile" class="card-actions compact-actions mobile-order-primary-actions">
            <button v-if="trackingNumber(order)" class="outline-btn small" @click="copyText(trackingNumber(order), 'EMS 单号已复制')">复制单号</button>
            <button v-if="trackingNumber(order)" class="outline-btn small" @click="openMyOrderTrackModal(order)">查看轨迹</button>
            <button v-if="trackingNumber(order)" class="outline-btn small" @click="refreshMyOrderTracks(order)">刷新轨迹</button>
            <button v-if="trackQueryUrl(order)" class="outline-btn small" @click="openTrackingQuery(order)">官网查询</button>
            <button v-if="order.payment_proof" class="outline-btn small" @click="previewImage(order.payment_proof)">付款截图</button>
          </div>
          <div v-if="!isCompactMobile && userOrderNoticeItems(order).length" class="user-order-notice-grid">
            <article v-for="notice in userOrderNoticeItems(order)" :key="notice.key" class="user-order-notice" :class="[notice.level, { unread: !notice.read_at }]">
              <div class="user-order-notice-head">
                <strong>{{ notice.title }}</strong>
                <span>{{ notice.time ? formatDateTime(notice.time) : '刚刚' }}</span>
              </div>
              <p>{{ notice.message }}</p>
              <span class="muted-copy">{{ notice.read_at ? '已读时间：' + formatDateTime(notice.read_at) : '未读提醒' }}</span>
            </article>
          </div>
          <div v-if="!isCompactMobile && userOrderNoticeHistory(order).length" class="card-actions compact-actions">
            <span class="muted-copy">提醒历史 {{ userOrderNoticeHistory(order).length }} 条 / {{ userOrderLastReadAt(order) ? '最后已读：' + formatDateTime(userOrderLastReadAt(order)) : '尚未标记已读' }}</span>
            <button v-if="userOrderUnreadNoticeCount(order)" class="outline-btn small" @click="markMyOrderNoticesRead(order)">标记本单已读</button>
          </div>
          <div v-if="!isCompactMobile" class="detail-grid">
            <div class="detail-card"><span>订单内容</span><strong>{{ order.summary_text }}</strong><p>总金额 {{ currency(order.total_amount) }}<template v-if="orderPlanDiscountAmount(order)"> / 卡费已减免 {{ currency(orderPlanDiscountAmount(order)) }}</template></p></div>
            <div class="detail-card"><span>收货 / 回寄地址</span><strong>{{ order.shipping_address }}</strong><p>{{ order.remark || '无备注' }}</p></div>
            <div class="detail-card"><span>付款方式</span><strong>{{ paymentText(order.payment_method) }}</strong><button v-if="order.payment_proof" class="outline-btn small" @click="previewImage(order.payment_proof)">查看付款截图</button></div>
            <div class="detail-card">
              <span>商家回寄</span>
              <strong>{{ trackingCompany(order) }}</strong>
              <p>{{ trackingNumber(order) || '暂未出单' }}</p>
              <p v-if="order.ems.track_summary" class="muted-copy">{{ order.ems.track_summary }}</p>
              <div class="copy-inline">
                <button v-if="trackingNumber(order)" class="outline-btn small" @click="copyText(trackingNumber(order), '快递单号已复制')">复制快递单号</button>
                <button v-if="trackingNumber(order)" class="outline-btn small" @click="openMyOrderTrackModal(order)">查看完整轨迹</button>
                <button v-if="trackingNumber(order)" class="outline-btn small" @click="refreshMyOrderTracks(order)">刷新轨迹</button>
                <button v-if="trackQueryUrl(order)" class="outline-btn small" @click="openTrackingQuery(order)">官网查询</button>
              </div>
            </div>
          </div>
          <div v-if="!isCompactMobile" class="address-card user-logistics-panel">
            <div>
              <span>物流进度</span>
              <strong>{{ userTrackHeadline(order) }}</strong>
              <p>{{ userTrackDescription(order) }}</p>
              <div class="inline-badges">
                <span>{{ orderLogisticsStage(order).label }}</span>
                <span v-if="trackingNumber(order)">EMS {{ trackingNumber(order) }}</span>
              </div>
              <p class="muted-copy">最近同步：{{ formatTrackSyncAge(order.ems.last_track_sync_at) }}</p>
            </div>
            <div class="contact-actions">
              <button v-if="trackingNumber(order)" class="outline-btn small" @click="copyText(trackingNumber(order), 'EMS 单号已复制')">复制 EMS 单号</button>
              <button v-if="trackingNumber(order)" class="outline-btn small" @click="openMyOrderTrackModal(order)">查看完整轨迹</button>
              <button v-if="trackingNumber(order)" class="outline-btn small" @click="refreshMyOrderTracks(order)">立即刷新</button>
              <button v-if="trackQueryUrl(order)" class="outline-btn small" @click="openTrackingQuery(order)">官网查询</button>
            </div>
          </div>
          <details v-if="isCompactMobile" class="mobile-fold-card mobile-order-fold">
            <summary class="mobile-fold-summary">查看订单详情</summary>
            <div class="mobile-fold-body">
              <div class="detail-grid mobile-order-detail-grid">
                <div class="detail-card"><span>订单内容</span><strong>{{ order.summary_text }}</strong><p>总金额 {{ currency(order.total_amount) }}<template v-if="orderPlanDiscountAmount(order)"> / 卡费已减免 {{ currency(orderPlanDiscountAmount(order)) }}</template></p></div>
                <div class="detail-card"><span>收货 / 回寄地址</span><strong>{{ order.shipping_address }}</strong><p>{{ order.remark || '无备注' }}</p></div>
                <div class="detail-card"><span>付款方式</span><strong>{{ paymentText(order.payment_method) }}</strong><button v-if="order.payment_proof" class="outline-btn small" @click="previewImage(order.payment_proof)">查看付款截图</button></div>
                <div class="detail-card">
                  <span>物流进度</span>
                  <strong>{{ userTrackHeadline(order) }}</strong>
                  <p>{{ userTrackDescription(order) }}</p>
                  <p class="muted-copy">最近同步：{{ formatTrackSyncAge(order.ems.last_track_sync_at) }}</p>
                </div>
              </div>
              <div v-if="userOrderNoticeItems(order).length" class="user-order-notice-grid mobile-user-order-notice-grid">
                <article v-for="notice in userOrderNoticeItems(order)" :key="notice.key" class="user-order-notice" :class="[notice.level, { unread: !notice.read_at }]">
                  <div class="user-order-notice-head">
                    <strong>{{ notice.title }}</strong>
                    <span>{{ notice.time ? formatDateTime(notice.time) : '刚刚' }}</span>
                  </div>
                  <p>{{ notice.message }}</p>
                  <span class="muted-copy">{{ notice.read_at ? '已读时间：' + formatDateTime(notice.read_at) : '未读提醒' }}</span>
                </article>
              </div>
              <div v-if="userOrderNoticeHistory(order).length" class="card-actions compact-actions">
                <span class="muted-copy">提醒历史 {{ userOrderNoticeHistory(order).length }} 条 / {{ userOrderLastReadAt(order) ? '最后已读：' + formatDateTime(userOrderLastReadAt(order)) : '尚未标记已读' }}</span>
                <button v-if="userOrderUnreadNoticeCount(order)" class="outline-btn small" @click="markMyOrderNoticesRead(order)">标记本单已读</button>
              </div>
            </div>
          </details>
          <div v-if="order.flow_type === 'ship_device'" class="address-card">
            <div>
              <span>你寄给商家的快递信息</span>
              <strong>{{ order.device_submission.outbound_company || '快递公司未填写' }}</strong>
              <p>{{ order.device_submission.outbound_tracking || '快递单号未填写' }}</p>
              <p class="muted-copy">寄出设备后，把快递公司和单号补在这里，商家处理会更快。</p>
            </div>
            <button v-if="allowOrderDeviceShipmentUpdate(order)" class="outline-btn small" @click="saveMyOrderDeviceShipment(order)">保存寄出快递</button>
          </div>
          <div v-if="allowOrderDeviceShipmentUpdate(order)" class="editor-grid">
            <input v-model.trim="order.device_submission.outbound_company" class="input" placeholder="寄出快递公司">
            <input v-model.trim="order.device_submission.outbound_tracking" class="input" placeholder="寄出快递单号">
          </div>
          <div v-if="allowPaymentProofRefresh(order)" class="reupload-proof">
            <label class="upload-field" :class="{ 'has-file': orderProofFiles[order.id] }">
              <input class="upload-input" type="file" accept="image/*" @change="onOrderProofChange($event, order.id)">
              <span class="upload-meta">
                <span class="upload-title">补传付款截图</span>
                <span class="upload-hint">{{ orderProofFiles[order.id] ? '已选择新的截图，提交后会替换原付款凭证并自动压缩' : '如果原图不清晰或漏传，可以在这里重新上传，系统会自动压缩为 WebP/AVIF' }}</span>
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
<div v-if="showTrackModal && activeTrackModalOrder" class="overlay" @click.self="closeMyOrderTrackModal">
  <div class="modal-card wide">
    <div class="modal-head">
      <div>
        <h3>物流轨迹</h3>
        <p class="muted-copy">{{ activeTrackModalOrder.order_no }} / EMS {{ trackingNumber(activeTrackModalOrder) || '待生成' }}</p>
      </div>
      <button class="icon-btn" @click="closeMyOrderTrackModal">×</button>
    </div>
    <div class="modal-body">
      <div class="address-card user-logistics-panel">
        <div>
          <span>最新进度</span>
          <strong>{{ userTrackHeadline(activeTrackModalOrder) }}</strong>
          <p>{{ userTrackDescription(activeTrackModalOrder) }}</p>
          <p class="muted-copy">最近同步：{{ formatTrackSyncAge(activeTrackModalOrder.ems.last_track_sync_at) }}</p>
        </div>
        <div class="contact-actions">
          <button v-if="trackingNumber(activeTrackModalOrder)" class="outline-btn small" @click="copyText(trackingNumber(activeTrackModalOrder), 'EMS 单号已复制')">复制 EMS 单号</button>
          <button v-if="trackingNumber(activeTrackModalOrder)" class="outline-btn small" @click="refreshMyOrderTracks(activeTrackModalOrder)">刷新轨迹</button>
          <button v-if="trackQueryUrl(activeTrackModalOrder)" class="outline-btn small" @click="openTrackingQuery(activeTrackModalOrder)">官网查询</button>
        </div>
      </div>
      <div v-if="activeTrackModalOrder.ems.track_items && activeTrackModalOrder.ems.track_items.length" class="track-inline-list user-track-list track-modal-list">
        <article v-for="track in reversedTrackItems(activeTrackModalOrder)" :key="track.op_time + track.op_code + track.op_desc" class="track-inline-item">
          <div class="track-inline-head">
            <strong>{{ track.op_name || track.op_desc || '物流轨迹' }}</strong>
            <span>{{ track.op_time }}</span>
          </div>
          <p>{{ track.op_desc || '暂无详情' }}</p>
          <span class="muted-copy">{{ [track.op_org_name, track.product_name].filter(Boolean).join(' / ') }}</span>
        </article>
      </div>
      <div v-else class="empty-box compact-empty">当前还没有完整轨迹，后续同步后会显示在这里。</div>
    </div>
  </div>
</div>
<div v-if="showAdminTrackModal && activeAdminTrackModalOrder" class="overlay" @click.self="closeAdminTrackModal">
  <div class="modal-card wide">
    <div class="modal-head">
      <div>
        <h3>EMS 完整轨迹</h3>
        <p class="muted-copy">{{ activeAdminTrackModalOrder.order_no }} / EMS {{ trackingNumber(activeAdminTrackModalOrder) || '待生成' }}</p>
      </div>
      <button class="icon-btn" @click="closeAdminTrackModal">脳</button>
    </div>
    <div class="modal-body">
      <div class="address-card user-logistics-panel">
        <div>
          <span>最新进度</span>
          <strong>{{ userTrackHeadline(activeAdminTrackModalOrder) }}</strong>
          <p>{{ userTrackDescription(activeAdminTrackModalOrder) }}</p>
          <p class="muted-copy">最近同步：{{ formatTrackSyncAge(activeAdminTrackModalOrder.ems.last_track_sync_at) }}</p>
        </div>
        <div class="contact-actions">
          <button v-if="trackingNumber(activeAdminTrackModalOrder)" class="outline-btn small" @click="copyText(trackingNumber(activeAdminTrackModalOrder), 'EMS 单号已复制')">复制 EMS 单号</button>
          <button v-if="trackingNumber(activeAdminTrackModalOrder)" class="outline-btn small" @click="syncAdminOrderTracks(activeAdminTrackModalOrder)">刷新轨迹</button>
          <button v-if="trackQueryUrl(activeAdminTrackModalOrder)" class="outline-btn small" @click="openTrackingQuery(activeAdminTrackModalOrder)">官网查询</button>
        </div>
      </div>
      <div v-if="activeAdminTrackModalOrder.ems.track_items && activeAdminTrackModalOrder.ems.track_items.length" class="track-inline-list track-modal-list">
        <article v-for="track in reversedTrackItems(activeAdminTrackModalOrder)" :key="track.op_time + track.op_code + track.op_desc" class="track-inline-item">
          <div class="track-inline-head">
            <strong>{{ track.op_name || track.op_desc || '物流轨迹' }}</strong>
            <span>{{ track.op_time }}</span>
          </div>
          <p>{{ track.op_desc || '暂无详情' }}</p>
          <span class="muted-copy">{{ [track.op_org_name, track.product_name].filter(Boolean).join(' / ') }}</span>
        </article>
      </div>
      <div v-else class="empty-box compact-empty">当前还没有完整轨迹，后续同步后会显示在这里。</div>
    </div>
  </div>
</div>
<div v-if="showAdminDeleteModal" class="overlay" @click.self="closeAdminDeleteModal()">
  <div class="modal-card">
    <div class="modal-head">
      <div>
        <h3>{{ adminDeleteOrderIds.length > 1 ? '批量删除订单' : '删除订单' }}</h3>
        <p class="muted-copy">删除后不可恢复，请确认当前选择无误。</p>
      </div>
      <button class="icon-btn" :disabled="savingStates.deleteOrders" @click="closeAdminDeleteModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="warning-strip danger-lite">
        <strong>本次将处理 {{ adminDeleteSummary.total }} 单订单</strong>
        <p>付款截图 {{ adminDeleteSummary.paymentProofs }} 份、EMS 面单 {{ adminDeleteSummary.labels }} 份会一起清理。</p>
        <p v-if="adminDeleteSummary.stockRestoreCount">并会自动回补设备库存 {{ adminDeleteSummary.stockRestoreCount }} 件。</p>
        <p v-else>这些订单不会触发额外库存回补。</p>
      </div>
      <div class="log-panel">
        <div class="log-head">
          <strong>即将删除的订单</strong>
          <span>{{ adminDeleteSummary.total }} 单</span>
        </div>
        <div class="log-list">
          <article v-for="order in adminDeleteOrders.slice(0, 6)" :key="'delete-preview-' + order.id" class="log-item">
            <div class="log-item-head">
              <strong>{{ order.order_no }}</strong>
              <span>{{ orderStatusText(order.status) }}</span>
            </div>
            <p>{{ order.customer_name }} / {{ order.customer_phone }}</p>
            <p class="muted-copy">{{ order.plan_snapshot?.name || '未命名套餐' }}<template v-if="order.device_snapshot"> / {{ order.device_snapshot.name }}</template></p>
          </article>
        </div>
        <p v-if="adminDeleteOrders.length > 6" class="muted-copy">其余 {{ adminDeleteOrders.length - 6 }} 单将在确认后一起删除。</p>
      </div>
      <div class="card-actions">
        <button class="outline-btn" :disabled="savingStates.deleteOrders" @click="closeAdminDeleteModal()">取消</button>
        <button class="danger-btn" :disabled="savingStates.deleteOrders" @click="confirmDeleteAdminOrders">{{ savingStates.deleteOrders ? '删除中...' : (adminDeleteOrderIds.length > 1 ? '确认批量删除' : '确认删除') }}</button>
      </div>
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
              <span class="upload-hint">{{ planImageFile ? '已选择新图片，保存后会替换当前套餐图，并自动压缩为 WebP/AVIF' : (planEditorPreview ? '当前正在使用已有套餐图，可重新选择替换；新图会自动压缩为 WebP/AVIF' : '建议上传清晰完整的资费图片，系统会自动压缩为 WebP/AVIF，前台按比例完整展示') }}</span>
              <span class="upload-filename">{{ planImageFile ? planImageFile.name : (planEditorPreview ? '当前已有套餐图' : '暂未选择图片') }}</span>
            </span>
            <span class="upload-trigger">{{ planImageFile ? '重新选择' : '选择图片' }}</span>
          </label>
        </div>
        <div class="admin-form-grid grow">
          <input v-model.trim="planEditorForm.name" class="input" placeholder="套餐名称">
          <input v-model.trim="planEditorForm.badge" class="input" placeholder="角标文案">
          <select v-model="planEditorForm.carrier" class="input">
            <option value="">选择运营商</option>
            <option value="中国移动">移动</option>
            <option value="中国联通">联通</option>
            <option value="中国电信">电信</option>
            <option value="中国广电">广电</option>
          </select>
          <input v-model.trim="planEditorForm.network_type" class="input" placeholder="网络类型">
          <input v-model.trim="planEditorForm.monthly_data" class="input" placeholder="套餐流量">
          <input v-model.number="planEditorForm.monthly_price" type="number" min="0" class="input" placeholder="月费参考价">
          <input v-model.number="planEditorForm.setup_price" type="number" min="0" class="input" placeholder="配卡费">
          <input v-model.number="planEditorForm.hot_rank" type="number" min="0" class="input" placeholder="热销排序">
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
              <span class="upload-hint">{{ deviceImageFile ? '已选择新图片，保存后会替换当前设备图，并自动压缩为 WebP/AVIF' : (deviceEditorPreview ? '当前正在使用已有设备图，可重新选择替换；新图会自动压缩为 WebP/AVIF' : '建议上传白底或清晰主图，系统会自动压缩为 WebP/AVIF，便于手机端完整展示') }}</span>
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
          <input v-model.number="deviceEditorForm.hot_rank" type="number" min="0" class="input" placeholder="热销排序">
          <input v-model.number="deviceEditorForm.sort_order" type="number" min="1" class="input" placeholder="排序">
          <input v-model.trim="deviceEditorForm.badge" class="input" placeholder="角标文案">
          <input v-model.trim="deviceEditorForm.short_description" class="input full-span" placeholder="简短介绍">
          <textarea v-model.trim="deviceEditorForm.features_text" class="input full-span" rows="4" placeholder="设备卖点，一行一条"></textarea>
          <textarea v-model.trim="deviceEditorForm.tags_text" class="input full-span" rows="2" placeholder="标签，换行或逗号分隔"></textarea>
          <div class="compatibility-editor full-span">
            <div class="builder-title compact-title">
              <h4>可配套餐限制</h4>
              <span>不勾选表示全部不可用</span>
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
