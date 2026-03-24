window.AppState = (() => {
    const { linesToText } = window.AppTools;

    const defaultBuilder = () => ({
        flow_type: 'buy_device',
        plan_id: null,
        device_id: null,
        quantity: 1,
        payment_method: 'wechat',
        customer_name: '',
        customer_phone: '',
        shipping_address: '',
        remark: '',
        customer_device_brand: '',
        customer_device_model: '',
        customer_device_can_insert_card: 'unknown',
        customer_device_remove_control: 'unknown',
        customer_device_condition: '',
        customer_device_notes: '',
        customer_device_tracking: '',
    });

    const defaultPlanEditor = () => ({
        id: null,
        name: '',
        badge: '',
        carrier: '',
        network_type: '',
        monthly_data: '',
        monthly_price: 0,
        setup_price: 39,
        best_for: '',
        coverage: '',
        purchase_note: '',
        description: '',
        features_text: '',
        tags_text: '',
        hot_rank: 10,
        sort_order: 1,
        featured: true,
        status: 'active',
    });

    const defaultDeviceEditor = () => ({
        id: null,
        name: '',
        model: '',
        category: 'portable_wifi',
        network_type: '',
        price: 199,
        original_price: 269,
        stock: 10,
        badge: '',
        short_description: '',
        description: '',
        features_text: '',
        tags_text: '',
        compatible_plan_ids: [],
        hot_rank: 10,
        sort_order: 1,
        featured: true,
        status: 'active',
    });

    const buildSettingsForm = (settings) => ({
        ...settings,
        buy_flow_steps_text: linesToText(settings.buy_flow_steps),
        ship_flow_steps_text: linesToText(settings.ship_flow_steps),
        ship_checklist_text: linesToText(settings.ship_checklist),
        purchase_rules_text: linesToText(settings.purchase_rules),
        faq_items_text: linesToText(settings.faq_items),
        admin_note_templates_text: linesToText(settings.admin_note_templates),
    });

    return { defaultBuilder, defaultPlanEditor, defaultDeviceEditor, buildSettingsForm };
})();
