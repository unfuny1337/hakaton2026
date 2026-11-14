/* PAYLOAD ZERO — ready-made builds for the tutorial and quick starts.
 * These are game configurations that pass the launch checks, not NASA flight configurations
 * and not a guaranteed win: the crisis decision and the survival check still apply.
 * Load after engine.js. Names and trade-off notes are localized in i18n-dict.js (preset.<id>.*).
 */
const PZ_PRESETS = Object.freeze({
  m3: [
    {
      id: 'earth_f9_ka',
      rocketId: 'lv_falcon_med',
      bus: { chassis: 'ch_light', power: 'pw_solar_m', battery: 'bat_highcap', comms: 'com_kaband',
        computer: 'cpu_economy', propulsion: 'propulsion_light', thermal: 'thermal_passive' },
      instrumentIds: ['inst_oli2', 'inst_tirs2']
    },
    {
      id: 'earth_atlas_reliable',
      rocketId: 'lv_atlas_v',
      bus: { chassis: 'ch_std', power: 'pw_solar_m', battery: 'bat_highcap', comms: 'com_kaband',
        computer: 'cpu_economy', propulsion: 'propulsion_light', thermal: 'thermal_passive' },
      instrumentIds: ['inst_oli2', 'inst_tirs2']
    }
  ],
  m1: [
    {
      id: 'moon_fh_shielded',
      rocketId: 'lv_falcon_heavy',
      bus: { chassis: 'ch_shielded', power: 'pw_solar_m', battery: 'bat_liion', comms: 'com_xband',
        computer: 'cpu_rad750', propulsion: 'propulsion_light', thermal: 'thermal_passive' },
      instrumentIds: ['inst_lola', 'inst_lend', 'inst_lroc']
    },
    {
      id: 'moon_f9_narrow',
      rocketId: 'lv_falcon_med',
      bus: { chassis: 'ch_std', power: 'pw_solar_m', battery: 'bat_liion', comms: 'com_sband_low',
        computer: 'cpu_rad750', propulsion: 'propulsion_light', thermal: 'thermal_passive' },
      instrumentIds: ['inst_lola', 'inst_lend', 'inst_lroc']
    }
  ],
  m2: [
    {
      id: 'mars_fh_lean',
      rocketId: 'lv_falcon_heavy',
      bus: { chassis: 'ch_shielded', power: 'pw_solar_l', battery: 'bat_liion', comms: 'com_xband',
        computer: 'cpu_rad750', propulsion: 'propulsion_light', thermal: 'thermal_passive' },
      instrumentIds: ['inst_crism', 'inst_sharad']
    },
    {
      id: 'mars_sls_heavy',
      rocketId: 'lv_sls',
      bus: { chassis: 'ch_shielded', power: 'pw_solar_l', battery: 'bat_highcap', comms: 'com_kaband',
        computer: 'cpu_rad750', propulsion: 'propulsion', thermal: 'thermal' },
      instrumentIds: ['inst_hirise', 'inst_crism', 'inst_sharad']
    }
  ]
});
