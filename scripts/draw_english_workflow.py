# -*- coding: utf-8 -*-
"""
Generate publication-grade English version of DSS Workflow diagram (Figure 3)
for Scopus publication with clean vector styling.
"""

import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch
import numpy as np
import os

def draw_english_dss_workflow():
    plt.rcParams['font.sans-serif'] = ['Segoe UI', 'Arial', 'DejaVu Sans']
    plt.rcParams['font.family'] = 'sans-serif'
    
    fig, ax = plt.subplots(figsize=(10.5, 13.5), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 132)
    ax.axis('off')

    # Color Palette matching original diagram with premium academic finish
    c_step1_bg = "#F0F6FC"
    c_step1_hdr = "#1D5C96"
    c_step1_border = "#B3D1F0"

    c_step2_bg = "#F2F9F2"
    c_step2_hdr = "#2E7D32"
    c_step2_border = "#B8E2B9"

    c_step3_bg = "#FFF7EB"
    c_step3_hdr = "#E65100"
    c_step3_border = "#FFD199"

    c_step4_bg = "#FDF2F2"
    c_step4_hdr = "#B71C1C"
    c_step4_border = "#F5B8B8"

    def draw_step_container(y_bot, height, bg_color, border_color, hdr_color, step_title, step_badge):
        # Outer Card
        card = FancyBboxPatch((4, y_bot), 92, height,
                              boxstyle="round,pad=0.5,rounding_size=2.0",
                              facecolor=bg_color, edgecolor=border_color, linewidth=1.5)
        ax.add_patch(card)

        # Header Bar
        hdr = FancyBboxPatch((4, y_bot + height - 5.5), 92, 5.5,
                             boxstyle="round,pad=0.0,rounding_size=1.5",
                             facecolor=hdr_color, edgecolor=hdr_color, linewidth=0)
        ax.add_patch(hdr)

        # Header Text
        ax.text(6, y_bot + height - 3.2, step_badge, color="white", fontsize=11, fontweight='bold', va='center')
        ax.text(23, y_bot + height - 3.2, f"—  {step_title}", color="white", fontsize=11, fontweight='bold', va='center')

    # ----------------------------------------------------
    # STEP 1: DATA INGESTION & MONITORING (y: 99 to 128, height: 29)
    # ----------------------------------------------------
    draw_step_container(99, 29, c_step1_bg, c_step1_border, c_step1_hdr, 
                        "Data Acquisition & Real-Time Telemetry", "STEP 1")

    # REST API & Web Scraper boxes
    box_api = FancyBboxPatch((8, 114), 17, 8, boxstyle="round,pad=0.3", facecolor="white", edgecolor="#64B5F6", linewidth=1.2)
    ax.add_patch(box_api)
    ax.text(16.5, 119.2, "REST API", fontsize=10, fontweight='bold', ha='center', color="#0D47A1")
    ax.text(16.5, 116.0, "Danang Open Data", fontsize=7.5, ha='center', color="#555555")

    box_scr = FancyBboxPatch((8, 103), 17, 8, boxstyle="round,pad=0.3", facecolor="white", edgecolor="#64B5F6", linewidth=1.2)
    ax.add_patch(box_scr)
    ax.text(16.5, 108.2, "Web Scraper", fontsize=10, fontweight='bold', ha='center', color="#0D47A1")
    ax.text(16.5, 105.0, "PCTT / VRAIN Live", fontsize=7.5, ha='center', color="#555555")

    # Connecting Arrows to Ingestion
    ax.annotate('', xy=(29, 111.5), xytext=(25, 118),
                arrowprops=dict(arrowstyle="->", color="#1D5C96", lw=1.5))
    ax.annotate('', xy=(29, 111.5), xytext=(25, 107),
                arrowprops=dict(arrowstyle="->", color="#1D5C96", lw=1.5))

    # Central Ingestion Box
    box_ingest = FancyBboxPatch((29, 104), 21, 15, boxstyle="round,pad=0.4", facecolor="#E1EFFE", edgecolor="#1E88E5", linewidth=1.5)
    ax.add_patch(box_ingest)
    ax.text(39.5, 113.5, "Data Acquisition\n& Processing", fontsize=9.5, fontweight='bold', ha='center', va='center', color="#0D47A1")
    ax.text(39.5, 107.0, "(Sub-minute Cron)", fontsize=7.5, ha='center', color="#424242")

    # Variables
    vars_y = [117.0, 111.5, 106.0]
    vars_labels = [
        ("• Reservoir Water Level (Z)", "[m]"),
        ("• Inflow / Outflow Discharge (Q)", "[m³/s]"),
        ("• Observed Precipitation (P)", "[mm/h]")
    ]
    for idx, (lbl, unit) in enumerate(vars_labels):
        y_pos = vars_y[idx]
        ax.plot([50, 53], [111.5, y_pos], color="#1D5C96", lw=1.2)
        ax.plot([53, 55], [y_pos, y_pos], color="#1D5C96", lw=1.2)
        ax.text(56, y_pos, lbl, fontsize=8.5, fontweight='bold', va='center', color="#212121")
        ax.text(80, y_pos, unit, fontsize=8.0, va='center', color="#616161")

    # Display Box
    box_disp = FancyBboxPatch((82, 106), 12, 11, boxstyle="round,pad=0.3", facecolor="white", edgecolor="#1976D2", linewidth=1.2)
    ax.add_patch(box_disp)
    ax.text(88, 113.0, "Live Data\nDisplay", fontsize=9.0, fontweight='bold', ha='center', va='center', color="#0D47A1")
    ax.text(88, 108.5, "SCADA Panel", fontsize=7.5, ha='center', color="#616161")

    ax.annotate('', xy=(82, 111.5), xytext=(78, 111.5),
                arrowprops=dict(arrowstyle="->", color="#1D5C96", lw=1.5))

    # Connector down to Step 2
    ax.plot([88, 88, 10, 10], [99, 96.5, 96.5, 93], color="#546E7A", lw=1.2, linestyle="--")
    ax.annotate('', xy=(10, 92), xytext=(10, 94),
                arrowprops=dict(arrowstyle="->", color="#546E7A", lw=1.2))

    # ----------------------------------------------------
    # STEP 2: INFLOW FORECASTING (y: 67 to 95, height: 28)
    # ----------------------------------------------------
    draw_step_container(67, 28, c_step2_bg, c_step2_border, c_step2_hdr, 
                        "Inflow Discharge Forecasting", "STEP 2")

    # Forecasting Models Sub-frame
    sub_frame = FancyBboxPatch((8, 70), 45, 19, boxstyle="round,pad=0.4", facecolor="white", edgecolor="#81C784", linewidth=1.2)
    ax.add_patch(sub_frame)
    ax.text(30.5, 86.0, "Forecasting Models", fontsize=9.5, fontweight='bold', ha='center', color="#1B5E20")

    # ARIMAX box
    box_arimax = FancyBboxPatch((10, 78.5), 41, 6.5, boxstyle="round,pad=0.2", facecolor="#E8F5E9", edgecolor="#4CAF50", linewidth=1.0)
    ax.add_patch(box_arimax)
    ax.text(12, 83.2, "ARIMAX Model", fontsize=9.2, fontweight='bold', va='center', color="#1B5E20")
    ax.text(12, 80.5, "1–6 Hours Lead-Time (Real-Time Gate Dispatch)", fontsize=7.5, va='center', color="#2E7D32")

    # LSTM box
    box_lstm = FancyBboxPatch((10, 71.2), 41, 6.5, boxstyle="round,pad=0.2", facecolor="#E8F5E9", edgecolor="#4CAF50", linewidth=1.0)
    ax.add_patch(box_lstm)
    ax.text(12, 75.8, "LSTM / Bi-LSTM + Attention", fontsize=9.2, fontweight='bold', va='center', color="#1B5E20")
    ax.text(12, 73.0, "24 Hours Ahead (Probabilistic P10 / P50 / P90)", fontsize=7.5, va='center', color="#2E7D32")

    # Hydrograph Graph Box
    box_hydro = FancyBboxPatch((58, 70), 35, 19, boxstyle="round,pad=0.4", facecolor="white", edgecolor="#81C784", linewidth=1.2)
    ax.add_patch(box_hydro)
    ax.text(75.5, 86.0, "Hydrograph Visualization", fontsize=9.5, fontweight='bold', ha='center', color="#1B5E20")

    # Mini hydrograph inside
    hx = np.linspace(61, 89, 40)
    hy = 72 + 9 * np.exp(-((hx - 73)**2) / 18)
    hy_lower = 72 + 6.5 * np.exp(-((hx - 73)**2) / 18)
    hy_upper = 72 + 11.5 * np.exp(-((hx - 73)**2) / 18)
    
    ax.fill_between(hx, hy_lower, hy_upper, color="#C8E6C9", alpha=0.6)
    ax.plot(hx, hy, color="#2E7D32", lw=1.8)
    ax.plot(hx, hy_upper, color="#81C784", lw=1.0, linestyle="--")
    ax.text(83.5, 81.0, "P90 (Upper)", fontsize=6.8, color="#2E7D32")
    ax.text(83.5, 78.0, "P50 (Median)", fontsize=6.8, fontweight='bold', color="#1B5E20")
    ax.text(83.5, 75.0, "P10 (Lower)", fontsize=6.8, color="#2E7D32")

    # Arrow from models to hydrograph
    ax.annotate('', xy=(58, 79.5), xytext=(53, 79.5),
                arrowprops=dict(arrowstyle="->", color="#2E7D32", lw=1.8))

    # Connector down to Step 3
    ax.annotate('', xy=(50, 61), xytext=(50, 67),
                arrowprops=dict(arrowstyle="->", color="#E65100", lw=1.8))

    # ----------------------------------------------------
    # STEP 3: OUTFLOW OPTIMIZATION (y: 35 to 61, height: 26)
    # ----------------------------------------------------
    draw_step_container(35, 26, c_step3_bg, c_step3_border, c_step3_hdr, 
                        "Outflow Discharge Optimization", "STEP 3")

    # Optimal Release Schedule
    box_sched = FancyBboxPatch((8, 40), 22, 14, boxstyle="round,pad=0.3", facecolor="white", edgecolor="#FFB74D", linewidth=1.2)
    ax.add_patch(box_sched)
    ax.text(19, 50.0, "Optimal Release\nSchedule", fontsize=9.0, fontweight='bold', ha='center', va='center', color="#E65100")
    ax.text(19, 44.5, "Q_out(t) Timeseries\nGate Aperture Rules", fontsize=7.5, ha='center', color="#5D4037")
    ax.text(19, 41.5, "Lead: 1–24h", fontsize=7.5, ha='center', fontweight='bold', color="#BF360C")

    # Arrow to SCE-UA
    ax.annotate('', xy=(37, 47), xytext=(30, 47),
                arrowprops=dict(arrowstyle="->", color="#E65100", lw=1.5))

    # SCE-UA Algorithm Box
    box_sce = FancyBboxPatch((37, 40), 24, 14, boxstyle="round,pad=0.4", facecolor="#FFE0B2", edgecolor="#FB8C00", linewidth=1.5)
    ax.add_patch(box_sce)
    ax.text(49, 49.0, "SCE-UA Global\nOptimization", fontsize=9.5, fontweight='bold', ha='center', va='center', color="#BF360C")
    ax.text(49, 43.0, "+ 1D-Spline Z-V Model", fontsize=7.5, ha='center', color="#4E342E")

    # Branch arrows to Objectives
    ax.annotate('', xy=(68, 51.5), xytext=(61, 47),
                arrowprops=dict(arrowstyle="->", color="#E65100", lw=1.2))
    ax.annotate('', xy=(68, 42.5), xytext=(61, 47),
                arrowprops=dict(arrowstyle="->", color="#E65100", lw=1.2))

    # Objective 1
    box_obj1 = FancyBboxPatch((68, 48), 25, 7.5, boxstyle="round,pad=0.3", facecolor="white", edgecolor="#FFB74D", linewidth=1.1)
    ax.add_patch(box_obj1)
    ax.text(70, 52.8, "Minimize Rule Violation", fontsize=8.2, fontweight='bold', color="#BF360C")
    ax.text(70, 50.2, "(Decision 1865 Limits)", fontsize=7.2, color="#555555")

    # Objective 2
    box_obj2 = FancyBboxPatch((68, 39), 25, 7.5, boxstyle="round,pad=0.3", facecolor="white", edgecolor="#FFB74D", linewidth=1.1)
    ax.add_patch(box_obj2)
    ax.text(70, 43.8, "Attenuate Flood Peak", fontsize=8.2, fontweight='bold', color="#BF360C")
    ax.text(70, 41.2, "(Downstream Protection)", fontsize=7.2, color="#555555")

    # Connector down to Step 4
    ax.annotate('', xy=(50, 29), xytext=(50, 35),
                arrowprops=dict(arrowstyle="->", color="#B71C1C", lw=1.8))

    # ----------------------------------------------------
    # STEP 4: ALERT & LOGGING (y: 3 to 29, height: 26)
    # ----------------------------------------------------
    draw_step_container(3, 26, c_step4_bg, c_step4_border, c_step4_hdr, 
                        "Automated Alerting & Operation Logging", "STEP 4")

    # Alert Box
    box_alert = FancyBboxPatch((8, 16.5), 47, 7.5, boxstyle="round,pad=0.3", facecolor="white", edgecolor="#EF9A9A", linewidth=1.2)
    ax.add_patch(box_alert)
    ax.text(10, 21.0, "Automated Early Warning", fontsize=9.0, fontweight='bold', color="#B71C1C")
    ax.text(10, 18.2, "Triggered when Z ≥ MNDBT or Z ≥ MNGC (Surcharge)", fontsize=7.5, color="#424242")

    # Log Box
    box_log = FancyBboxPatch((8, 7.0), 47, 7.5, boxstyle="round,pad=0.3", facecolor="white", edgecolor="#EF9A9A", linewidth=1.2)
    ax.add_patch(box_log)
    ax.text(10, 11.5, "Audit Trail: OperationLog", fontsize=9.0, fontweight='bold', color="#B71C1C")
    ax.text(10, 8.8, "Records dispatch decisions for inspection & compliance", fontsize=7.5, color="#424242")

    # Desktop WPF UI Display Representation
    box_wpf = FancyBboxPatch((61, 6), 33, 18.5, boxstyle="round,pad=0.4", facecolor="white", edgecolor="#C62828", linewidth=1.5)
    ax.add_patch(box_wpf)
    
    # Fake UI Window Header
    hdr_wpf = FancyBboxPatch((61, 21.0), 33, 3.5, boxstyle="round,pad=0.0", facecolor="#37474F", edgecolor="#37474F")
    ax.add_patch(hdr_wpf)
    ax.text(63, 22.8, "Desktop DSS Client (WPF / .NET)", fontsize=8, fontweight='bold', color="white")
    
    # UI Elements inside
    ax.text(63, 18.5, "Water Level (Z): 140.2 m", fontsize=7.5, fontweight='bold', color="#0D47A1")
    ax.text(78.5, 18.5, "Inflow: 1,250 m³/s", fontsize=7.5, color="#1B5E20")
    ax.text(63, 16.0, "Optimized Release: 850 m³/s", fontsize=7.5, fontweight='bold', color="#BF360C")
    ax.text(63, 13.5, "Status: Safe Flood-Cutting Mode", fontsize=7.5, color="#2E7D32")
    
    # Small chart inside UI
    cx = np.linspace(63, 91, 20)
    cy = 8.5 + 3 * np.sin((cx - 63) / 4)
    ax.plot(cx, cy, color="#1976D2", lw=1.2)
    ax.text(77, 7.2, "[ Live SCADA Hydrograph ]", fontsize=6.5, ha='center', color="#757575")

    # Arrow to WPF UI
    ax.annotate('', xy=(61, 15.5), xytext=(55, 15.5),
                arrowprops=dict(arrowstyle="->", color="#B71C1C", lw=1.5))

    # Output text below WPF
    ax.text(77.5, 4.0, "Desktop WPF Interface", fontsize=8.5, fontweight='bold', ha='center', color="#37474F")

    # Arrow from Step 4 back to Step 1 (Feedback Loop)
    ax.plot([6, 2, 2, 6], [16, 16, 114, 114], color="#78909C", lw=1.2, linestyle=":")
    ax.annotate('', xy=(7.5, 114), xytext=(5, 114),
                arrowprops=dict(arrowstyle="->", color="#78909C", lw=1.2))

    plt.tight_layout()
    
    # Save Image
    out_dir = "Documents/extracted_images"
    os.makedirs(out_dir, exist_ok=True)
    out_png = os.path.join(out_dir, "fig_dss_workflow_en.png")
    fig.savefig(out_png, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Successfully generated clean English DSS Workflow Diagram: {out_png}")

if __name__ == "__main__":
    draw_english_dss_workflow()
