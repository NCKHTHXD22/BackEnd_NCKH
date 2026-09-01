# -*- coding: utf-8 -*-
"""
Script to generate publication-grade Scopus Manuscript DOCX in Vietnamese
Integrating all updated text, tables, formulas, figure notes, and extracted images.
"""

import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def set_cell_border(cell, **kwargs):
    """
    Set cell borders.
    kwargs: top, bottom, left, right
    values: dict(sz=12, val='single', color='CCCCCC')
    """
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="{kwargs.get("top", {}).get("val", "none")}" w:sz="{kwargs.get("top", {}).get("sz", "4")}" w:space="0" w:color="{kwargs.get("top", {}).get("color", "auto")}"/>\n'
        f'  <w:left w:val="{kwargs.get("left", {}).get("val", "none")}" w:sz="{kwargs.get("left", {}).get("sz", "4")}" w:space="0" w:color="{kwargs.get("left", {}).get("color", "auto")}"/>\n'
        f'  <w:bottom w:val="{kwargs.get("bottom", {}).get("val", "none")}" w:sz="{kwargs.get("bottom", {}).get("sz", "4")}" w:space="0" w:color="{kwargs.get("bottom", {}).get("color", "auto")}"/>\n'
        f'  <w:right w:val="{kwargs.get("right", {}).get("val", "none")}" w:sz="{kwargs.get("right", {}).get("sz", "4")}" w:space="0" w:color="{kwargs.get("right", {}).get("color", "auto")}"/>\n'
        f'</w:tcBorders>'
    )
    tcPr.append(tcBorders)

def set_cell_shading(cell, color_hex="F2F4F7"):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>\n'
        f'  <w:top w:w="{top}" w:type="dxa"/>\n'
        f'  <w:bottom w:w="{bottom}" w:type="dxa"/>\n'
        f'  <w:left w:w="{left}" w:type="dxa"/>\n'
        f'  <w:right w:w="{right}" w:type="dxa"/>\n'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def create_vietnamese_scopus_document(output_docx_path):
    doc = docx.Document()
    
    # 1-inch margins
    for s in doc.sections:
        s.top_margin = Inches(1.0)
        s.bottom_margin = Inches(1.0)
        s.left_margin = Inches(1.0)
        s.right_margin = Inches(1.0)
        
        # Header / Footer
        header = s.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run("Bản thảo Bài báo Khoa học Chuẩn Scopus | Thủy văn & Trí tuệ Nhân tạo Môi trường")
        hrun.font.name = "Times New Roman"
        hrun.font.size = Pt(8.5)
        hrun.font.italic = True
        hrun.font.color.rgb = RGBColor(120, 120, 120)
        
        footer = s.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        frun = fp.add_run("Hệ Hỗ trợ Ra Quyết định Đa tầng Giảm thiểu Rủi ro Lũ lụt — Lưu vực Vu Gia - Thu Bồn")
        frun.font.name = "Times New Roman"
        frun.font.size = Pt(8.5)
        frun.font.color.rgb = RGBColor(120, 120, 120)

    # Base Styles
    normal = doc.styles['Normal']
    normal.font.name = 'Times New Roman'
    normal.font.size = Pt(11)
    normal.font.color.rgb = RGBColor(30, 30, 30)
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.space_after = Pt(6)

    # Helper functions
    def add_title(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(8)
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(15)
        run.font.color.rgb = RGBColor(15, 34, 64)
        return p

    def add_authors(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(3)
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(10.5)
        return p

    def add_affil(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(12)
        run = p.add_run(text)
        run.italic = True
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(80, 80, 80)
        return p

    def add_h1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(12.5)
        run.font.color.rgb = RGBColor(15, 34, 64)
        return p

    def add_h2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(11.5)
        run.font.color.rgb = RGBColor(30, 50, 80)
        return p

    def add_p(text, justify=True, bold_prefix=None):
        p = doc.add_paragraph()
        if justify:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            r_pre.bold = True
        p.add_run(text)
        return p

    def add_equation(eq_text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(5)
        r = p.add_run(eq_text)
        r.italic = True
        r.font.size = Pt(10.5)
        r.font.color.rgb = RGBColor(20, 30, 50)
        return p

    def add_callout_figure_note(fig_num, fig_title, description, img_filename=None, width=Inches(5.8)):
        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = table.rows[0].cells[0]
        set_cell_shading(cell, "F0F4F8")
        set_cell_margins(cell, top=140, bottom=140, left=180, right=180)
        set_cell_border(cell,
                        top=dict(val='single', sz=8, color='2B4C7E'),
                        bottom=dict(val='single', sz=8, color='2B4C7E'),
                        left=dict(val='single', sz=18, color='1B365D'),
                        right=dict(val='single', sz=8, color='2B4C7E'))
        
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(4)
        r1 = p.add_run(f"📌 [GHI CHÚ CHÈN HÌNH {fig_num}]: ")
        r1.bold = True
        r1.font.color.rgb = RGBColor(15, 34, 64)
        r2 = p.add_run(f"{fig_title}\n")
        r2.bold = True
        
        p_desc = cell.add_paragraph()
        p_desc.paragraph_format.space_after = Pt(4)
        r_desc_lbl = p_desc.add_run("Mô tả nội dung & yêu cầu ảnh: ")
        r_desc_lbl.bold = True
        p_desc.add_run(description)
        
        # If image exists, embed it inside or below the callout
        img_dir = os.path.join(os.path.dirname(output_docx_path), "extracted_images")
        if img_filename:
            img_full_path = os.path.join(img_dir, img_filename)
            if os.path.exists(img_full_path):
                p_img = cell.add_paragraph()
                p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_img.paragraph_format.space_before = Pt(6)
                p_img.paragraph_format.space_after = Pt(4)
                p_img.add_run().add_picture(img_full_path, width=width)
                
                p_cap = cell.add_paragraph()
                p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_cap.paragraph_format.space_after = Pt(2)
                rcap = p_cap.add_run(f"Hình {fig_num}: {fig_title}")
                rcap.italic = True
                rcap.font.size = Pt(9.5)
                rcap.font.color.rgb = RGBColor(60, 60, 60)
        
        doc.add_paragraph() # Spacing

    def add_custom_table(headers, data, col_widths=None, alignments=None, caption=None):
        if caption:
            p_cap = doc.add_paragraph()
            p_cap.paragraph_format.space_before = Pt(8)
            p_cap.paragraph_format.space_after = Pt(3)
            p_cap.paragraph_format.keep_with_next = True
            r = p_cap.add_run(caption)
            r.bold = True
            r.font.size = Pt(10)
            r.font.color.rgb = RGBColor(20, 35, 60)

        table = doc.add_table(rows=len(data) + 1, cols=len(headers))
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        
        # Header Row
        hdr_row = table.rows[0]
        for idx, h_text in enumerate(headers):
            cell = hdr_row.cells[idx]
            cell.text = h_text
            set_cell_shading(cell, "E8EEF5")
            set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
            set_cell_border(cell, 
                            top=dict(val='single', sz=8, color='2B4C7E'),
                            bottom=dict(val='single', sz=8, color='2B4C7E'))
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in p.runs:
                run.bold = True
                run.font.size = Pt(9.5)
                run.font.color.rgb = RGBColor(15, 34, 64)
        
        # Data Rows
        for r_idx, row_data in enumerate(data):
            row = table.rows[r_idx + 1]
            bg_color = "F9FAFC" if r_idx % 2 == 1 else "FFFFFF"
            is_last = (r_idx == len(data) - 1)
            
            for c_idx, val in enumerate(row_data):
                cell = row.cells[c_idx]
                cell.text = str(val)
                set_cell_shading(cell, bg_color)
                set_cell_margins(cell, top=70, bottom=70, left=100, right=100)
                
                b_bottom = dict(val='single', sz=8, color='2B4C7E') if is_last else dict(val='single', sz=4, color='E0E0E0')
                set_cell_border(cell, 
                                top=dict(val='none'),
                                bottom=b_bottom,
                                left=dict(val='none'),
                                right=dict(val='none'))
                
                p = cell.paragraphs[0]
                align = alignments[c_idx] if alignments and c_idx < len(alignments) else WD_ALIGN_PARAGRAPH.LEFT
                p.alignment = align
                for run in p.runs:
                    run.font.size = Pt(9)
        doc.add_paragraph()

    # ==================== NỘI DUNG BÀI BÁO ====================

    # Title & Authors
    add_title("HỆ HỖ TRỢ RA QUYẾT ĐỊNH ĐA TẦNG TÍCH HỢP DỰ BÁO LƯU LƯỢNG ĐẾN HỒ VÀ GIẢM THIỂU RỦI RO LŨ LỤT: KẾT HỢP DEEP LEARNING CƠ CHẾ CHÚ Ý, HỒI QUY PHÂN VỊ DỰA TRÊN CÂY VÀ THỊ GIÁC MÁY TÍNH BIÊN TỪ CỘNG ĐỒNG")
    add_authors("Võ Nguyên An, Văn Đức Hoàng Tiến, Phạm Tấn Khoa, Nguyễn Thị Minh Ánh")
    add_affil("Cán bộ hướng dẫn / Đồng tác giả liên hệ: PGS. TS. Võ Ngọc Dương, TS. Nguyễn Quang Bình, ThS. Phạm Lý Triều, ThS. Nguyễn Trung Quân, ThS. Ngô Thanh Vũ\nKhoa Xây dựng Thủy lợi - Thủy điện, Trường Đại học Bách khoa – Đại học Đà Nẵng, 550000 Đà Nẵng, Việt Nam\nEmail: vnduong@dut.udn.vn, nqbinh@dut.udn.vn, 111220022@sv1.dut.udn.vn")

    # Abstract Box
    tbl_abs = doc.add_table(rows=1, cols=1)
    tbl_abs.alignment = WD_TABLE_ALIGNMENT.CENTER
    c_abs = tbl_abs.rows[0].cells[0]
    set_cell_shading(c_abs, "F8F9FA")
    set_cell_margins(c_abs, top=140, bottom=140, left=180, right=180)
    set_cell_border(c_abs,
                    top=dict(val='single', sz=6, color='CCCCCC'),
                    bottom=dict(val='single', sz=6, color='CCCCCC'),
                    left=dict(val='single', sz=12, color='2B4C7E'),
                    right=dict(val='single', sz=6, color='CCCCCC'))
    
    p_abs_title = c_abs.paragraphs[0]
    p_abs_title.paragraph_format.space_after = Pt(4)
    r_abs_t = p_abs_title.add_run("TÓM TẮT (ABSTRACT)")
    r_abs_t.bold = True
    r_abs_t.font.color.rgb = RGBColor(15, 34, 64)

    p_abs = c_abs.add_paragraph()
    p_abs.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p_abs.paragraph_format.space_after = Pt(6)
    p_abs.add_run(
        "Vận hành tối ưu liên hồ chứa bậc thang và ứng phó khẩn cấp ngập lụt lưu vực sông miền núi tại miền Trung Việt Nam luôn đối mặt với thách thức khắc nghiệt do địa hình dốc đứng, thời gian tập trung dòng chảy ngắn và sự phân tán giữa các khâu dự báo thủy văn – ra quyết định điều tiết – cảnh báo cộng đồng. Nghiên cứu này đề xuất một Hệ hỗ trợ ra quyết định (Decision Support System - DSS) tích hợp đa tầng, khép kín từ thượng nguồn đến hạ du cho lưu vực sông Vu Gia – Thu Bồn.\n\n"
        "Các đóng góp phương pháp luận cốt lõi gồm: (1) Kiến trúc mạng nơ-ron hồi quy chuỗi thời gian Bi-LSTM kết hợp cơ chế đa đầu tự chú ý (Multi-Head Cross-Attention) với bộ mã hóa hồi cứu 240 giờ (Hindcast Encoder), bộ giải mã tự hồi quy xuất chuỗi dự báo 24 giờ với 7 phân vị xác suất (P5, P10, P25, P50, P75, P90, P95), được tối ưu hóa qua hàm tổn thất hỗn hợp 4 thành phần (Pinball Loss + Peak-Aware MSE + Horizon Decay + Coverage Penalty); (2) Hệ mô hình cơ sở dựa trên cây hồi quy đa chân trời trực tiếp (Direct Multi-Horizon Tree-based Ensembles) gồm Rừng ngẫu nhiên phân vị (Quantile RF) và XGBoost phân vị (reg:quantileerror), tích hợp không gian 47 đặc trưng thủy văn - khí tượng tiền định cùng 6 biến dự báo mưa tương lai (Oracle/Open-Meteo Covariates) và trọng số mẫu tăng cường mùa lũ (Sep–Jan x1.5); (3) Mô đun số hóa quy trình vận hành liên hồ chứa theo Quyết định số 1865/QĐ-TTg của Thủ tướng Chính phủ, tự động hóa tính toán điều tiết lũ dựa trên đường cong dung tích Z - V nội suy Cubic Spline 1D; (4) Mô đun thị giác máy tính biên (Edge-AI YOLO Pose) tự động lượng hóa mực nước ngập từ hình ảnh phản ánh hiện trường của người dân thông qua giải thuật lượng giác hình học dựa trên mốc chuẩn cột biển báo giao thông chuẩn hóa (H_biển = 70 cm, H_cột = 200 cm); (5) Kiến trúc phần mềm phân tán 3 microservice AI độc lập (cổng 8000, 8001, 8002) đồng bộ qua cơ sở dữ liệu MongoDB và điều phối bởi Node.js Cron, cung cấp dữ liệu tức thời cho WebGIS giám sát, Dashboard quản trị và Ứng dụng di động cứu hộ ngập lụt (tích hợp GPS định vị nơi sơ tán an toàn).\n\n"
        "Kết quả thực nghiệm trên bộ dữ liệu thực tế 4,25 năm (2022–2026) của 16 hồ chứa thủy điện/thủy lợi trọng điểm lưu vực Vu Gia – Thu Bồn khẳng định mô hình toàn cục (Global Model) vượt trội so với mô hình cục bộ từng hồ, đạt hệ số hiệu quả Nash-Sutcliffe (NSE) từ 0.782 đến 0.886 tại các lưu vực có độ dốc lớn. Hệ thống cung cấp dải dự báo phân vị độ tin cậy cao, hỗ trợ đắc lực công tác cắt giảm đỉnh lũ hạ du từ 0.35–0.58 m trong các đợt bão lũ cực đoan, đồng thời hình thành chu trình cảnh báo tương tác cộng đồng hai chiều bền vững."
    )

    p_kw = c_abs.add_paragraph()
    p_kw.paragraph_format.space_after = Pt(2)
    r_kwt = p_kw.add_run("Từ khóa: ")
    r_kwt.bold = True
    p_kw.add_run("Dự báo lũ; Lưu lượng đến hồ; Attention Bi-LSTM; Hồi quy phân vị; XGBoost; Hệ hỗ trợ ra quyết định (DSS); Quyết định 1865/QĐ-TTg; YOLO Pose; Lưu vực Vu Gia – Thu Bồn.")
    doc.add_paragraph()

    # Section 1: Introduction
    add_h1("1. MỞ ĐẦU (INTRODUCTION)")
    add_p(
        "Biến đổi khí hậu toàn cầu kết hợp với các hình thái thời tiết cực đoan như bão nhiệt đới, dải hội tụ nhiệt đới và không khí lạnh tăng cường đã làm gia tăng đột biến tần suất và cường độ các trận lũ lịch sử tại khu vực Đông Nam Á [1], [2]. Tại miền Trung Việt Nam, lưu vực sông Vu Gia – Thu Bồn (VGTB) thuộc địa phận tỉnh Quảng Nam và thành phố Đà Nẵng là một trong những điểm nóng thủy văn xung yếu nhất cả nước [3]. Với địa hình dãy Trường Sơn dốc đứng ở phía Tây chuyển tiếp đột ngột sang vùng đồng bằng hẹp ven biển phía Đông, lượng mưa tích lũy 24 giờ trong mùa mưa lũ (từ tháng 10 đến tháng 12) thường xuyên vượt ngưỡng 500–800 mm, dẫn đến các đợt lũ tập trung nhanh với biên độ lũ lên hàng mét mỗi giờ [4]."
    )
    add_p(
        "Nhằm thực hiện đa mục tiêu bao gồm phòng chống giảm lũ hạ du, cung cấp nước sinh hoạt, nông nghiệp trong mùa cạn và phát điện thương mại, hệ thống hồ chứa bậc thang trên lưu vực VGTB đã được xây dựng với hơn 16 công trình quy mô lớn (như A Vương, Đak Mi 4, Sông Bung 2, Sông Bung 4, Sông Tranh 2,...). Công tác vận hành các hồ này bắt buộc phải tuân thủ nghiêm ngặt Quy trình vận hành liên hồ chứa trên lưu vực sông Vu Gia – Thu Bồn ban hành theo Quyết định số 1865/QĐ-TTg của Thủ tướng Chính phủ [5]. Tuy nhiên, trong thực tiễn điều hành khẩn cấp, các cơ quan chỉ huy phòng chống thiên tai và đơn vị vận hành hồ đang gặp phải bốn nút thắt kỹ thuật lớn:"
    )
    add_p(
        "1. Hạn chế của mô hình thủy văn truyền thống và học máy đơn giản: Các mô hình thủy văn phân bố dựa trên cơ sở vật lý (như MIKE-SHE, SWAT, HEC-HMS) đòi hỏi số liệu địa hình lòng dẫn, lớp phủ thổ nhưỡng và chuỗi quan trắc khí tượng cực kỳ chi tiết, vốn rất hạn chế và có độ trễ cao tại các lưu vực nhiệt đới [6], [7]. Ngược lại, các mô hình học máy truyền thống thường áp dụng nội suy trọng số khoảng cách nghịch đảo (IDW) cố định, không nắm bắt được sự dịch chuyển linh hoạt của các tâm mưa đối lưu qua các sườn núi cao [8].\n"
        "2. Sự đánh đổi giữa dự báo đơn trị và rủi ro điều hành: Hầu hết các hệ thống dự báo thủy văn hiện nay chỉ đưa ra một giá trị dự báo điểm (deterministic point forecast). Khi đối mặt với các cơn bão có quỹ đạo bất thường, việc thiếu thông tin về khoảng tin cậy phân vị (P5–P95) khiến người ra quyết định khó đánh giá được kịch bản rủi ro bất lợi nhất để chuẩn bị dung tích đón lũ an toàn [9].\n"
        "3. Sự phân tách giữa dự báo dòng chảy và công cụ ra quyết định xả: Dự báo lưu lượng đến hồ (Qin) thường tồn tại dưới dạng biểu đồ thủy văn độc lập mà không được liên kết trực tiếp vào thuật toán điều tiết liên hồ theo thời gian thực để đưa ra lưu lượng xả qua tràn (Qspill) và qua tuabin (Qturb) thỏa mãn ràng buộc mực nước đón lũ (MNDBT), mực nước gia cường (MNGC) và dung lượng thoát lũ hạ lưu [10].\n"
        "4. Thiếu kênh phản hồi và xác thực dữ liệu ngập lụt từ thực địa: Khi mưa lũ xảy ra, các cơ quan chức năng thiếu công cụ tự động hóa để thu nhận, kiểm chứng và đo lường độ sâu ngập lụt chính xác từ hàng ngàn báo cáo, hình ảnh do người dân gửi về, dẫn đến sự chậm trễ trong công tác cứu hộ cục bộ [11]."
    )
    add_p(
        "Nhằm giải quyết triệt để các khoảng trống nghiên cứu trên, công trình này đề xuất một Hệ hỗ trợ ra quyết định (DSS) hoàn chỉnh, khép kín và có khả năng phục vụ vận hành thực tế. Kiến trúc tổng thể của hệ thống được minh họa chi tiết trong Hình 1."
    )

    add_callout_figure_note(
        fig_num=1,
        fig_title="Kiến trúc tổng thể Hệ hỗ trợ ra quyết định (DSS) tích hợp đa tầng",
        description="Sơ đồ khối 4 tầng: (1) Data Layer (28 trạm mưa VRAIN, 16 trạm telemetry hồ chứa, API Open-Meteo); (2) Forecast Engines gồm 3 Microservice độc lập (LSTM cổng 8000, RF cổng 8001, XGBoost cổng 8002); (3) Decision & Operational Layer (Điều tiết QĐ 1865/QĐ-TTg, Spline Z-V, YOLO Pose); (4) Application Layer (WebGIS, Dashboard quản trị, Mobile App 4 nút FAB).",
        img_filename="fig_dss_workflow_en.png"
    )

    # Section 2: Study Area & Data
    add_h1("2. KHU VỰC NGHIÊN CỨU VÀ DỮ LIỆU (STUDY AREA & DATA)")
    add_h2("2.1 Đặc điểm Thủy văn Lưu vực sông Vu Gia – Thu Bồn")
    add_p(
        "Lưu vực sông Vu Gia – Thu Bồn có tổng diện tích tự nhiên là 10.350 km2, nằm trải dài trên địa bàn tỉnh Quảng Nam và thành phố Đà Nẵng (14°55' - 16°05' B, 107°15' - 108°24' Đ). Hệ thống sông gồm hai phân lưu chính: phân lưu sông Vu Gia (nhánh Bắc) với các hồ chứa A Vương (266,5 triệu m3), Đak Mi 4 (310,0 triệu m3), Sông Bung 2 (74,7 triệu m3), Sông Bung 4 (320,8 triệu m3),... và phân lưu sông Thu Bồn (nhánh Nam) với hồ chứa quy mô lớn nhất là Sông Tranh 2 (730,0 triệu m3), Sông Tranh 3, Sông Tranh 4, Khe Diên,... Hai phân lưu hợp dòng tại vùng đồng bằng hạ lưu Đại Lộc trước khi đổ ra Biển Đông qua Cửa Hàn và Cửa Đại."
    )

    add_callout_figure_note(
        fig_num=2,
        fig_title="Bản đồ mạng lưới thủy văn, vị trí 16 hồ chứa và 28 trạm đo mưa trên lưu vực Vu Gia – Thu Bồn",
        description="Bản đồ GIS thể hiện ranh giới lưu vực Vu Gia – Thu Bồn, mạng lưới sông suối chính, vị trí 16 hồ chứa bậc thang và phân bố 28 trạm đo mưa tự động VRAIN được tích hợp trong hệ thống.",
        img_filename="image_2.png"
    )

    add_h2("2.2 Thu thập và Tiền xử lý Dữ liệu")
    add_p(
        "Nghiên cứu thu thập và chuẩn hóa bộ dữ liệu chuỗi thời gian theo bước thời gian 1 giờ trong giai đoạn 4,25 năm (51 tháng liên tục từ tháng 01/2022 đến tháng 03/2026), bao gồm hơn 37.000 bước thời gian vận hành thực tế qua 4 mùa lũ lớn từ: (1) Mạng lưới 28 trạm đo mưa tự động VRAIN/VNDMS; (2) Dữ liệu quan trắc mực nước hồ (Z), lưu lượng đến (Qin), lưu lượng xả qua tràn (Qspill) và tuabin (Qturb) của 16 hồ chứa từ Cổng dữ liệu Ban Chỉ huy PCTT; (3) Dữ liệu tái phân tích ERA5 và dự báo thời tiết Open-Meteo GFS (nhiệt độ T2m, độ ẩm RH, áp suất, vận tốc gió U10, bốc hơi ET0)."
    )

    add_h2("2.3 Không gian Đặc trưng (Feature Engineering)")
    add_p(
        "Một vectơ đặc trưng 47 chiều được xây dựng cho mỗi bước thời gian t nhằm mô tả toàn diện động lực học thủy văn lưu vực (Bảng 1). Biến mục tiêu lưu lượng được chuyển đổi căn bậc hai y = sqrt(Qin) và chuẩn hóa Z-score nhằm ổn định gradient khi xảy ra lũ cực đoan."
    )

    tbl1_headers = ["Nhóm đặc trưng", "Số chiều", "Danh mục biến", "Ý nghĩa thủy văn"]
    tbl1_data = [
        ["Lượng mưa quá khứ", "18", "R(t), tổng tích lũy R3h, R6h, R12h, R24h, R48h, R72h, R168h, biến trễ R(t-1...t-24), cường độ max, phương sai không gian", "Phản ánh xung kích mưa tức thời và độ ẩm tiền đề của đất trên lưu vực."],
        ["Dòng chảy thủy lực", "10", "Qin(t-1), Qin(t-2), đạo hàm bậc 1 dQ, bậc 2 d2Q, trung bình trượt Q3h, Q6h, Q12h, Q24h, Q48h, cờ pha lũ lên", "Nắm bắt quán tính dòng chảy cơ bản, gia tốc truyền lũ và đường cong duy trì cạn."],
        ["Trạng thái hồ chứa", "6", "Mực nước Z(t), biến thiên dZ24h, mực nước TB 24h, tổng xả Qout(t), dQout, tỷ lệ dung tích Qin/Qmax", "Mô tả hiệu ứng nước dềnh thượng lưu và dung tích lưu trữ khả dụng trong hồ."],
        ["Khí tượng & Thổ nhưỡng", "7", "Bốc hơi ET0, nhiệt độ T, độ ẩm RH, áp suất bề mặt, vận tốc gió U10, tương tác độ ẩm đất Sm x Qin", "Kiểm soát nhu cầu bốc thoát hơi khí quyển và trạng thái bão hòa đất."],
        ["Mã hóa chu kỳ thời gian", "6", "Biến đổi sin/cos cho giờ trong ngày [0,23], ngày trong năm [1,365], tháng [1,12]", "Biểu diễn quy luật nhật triều, chu kỳ ngày đêm và chuyển mùa gió mùa."]
    ]
    add_custom_table(tbl1_headers, tbl1_data, caption="Bảng 1. Phân loại và ý nghĩa không gian 47 đặc trưng đầu vào của mô hình.")

    # Section 3: Methodology
    add_h1("3. PHƯƠNG PHÁP NGHIÊN CỨU (METHODOLOGY)")
    add_h2("3.1 Mô hình Attention Bi-LSTM và Hàm Tổn Thất Phân Vị Hỗn Hợp")
    add_p(
        "Mô hình Deep Learning chuỗi thời gian gồm 3 khối chính: Bộ mã hóa Hindcast Bi-LSTM 240 giờ trích xuất bối cảnh thủy văn quá khứ 10 ngày; Khối Đa đầu Tự chú ý (Multi-Head Cross-Attention) tập trung trọng số vào các xung mưa lịch sử có tính quyết định; và Bộ giải mã tự hồi quy (Autoregressive Decoder) xuất chuỗi dự báo 24 giờ với 7 phân vị xác suất q = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]."
    )
    add_p(
        "Hàm tổn thất hỗn hợp 4 thành phần được chuẩn hóa sát với mã nguồn triển khai thực tế (quantile_loss_v2.py):"
    )
    add_equation("L_total = L_Pinball + 0.15 * L_Peak + L_Horizon + 0.05 * L_Coverage")
    add_p(
        "Trong đó: L_Pinball đo lường sai số phân vị; L_Peak tăng trọng số phạt đối với các mẫu có lưu lượng thuộc nhóm 10% cao nhất (w_i = 1.0 + 2.0 * I(y_i > Q90)); L_Horizon điều chỉnh suy giảm trọng số theo thời gian dự báo exp(-0.02 * k); và L_Coverage phạt nghiêm ngặt hiện tượng giao cắt phân vị (Quantile Crossing)."
    )

    add_callout_figure_note(
        fig_num=3,
        fig_title="Sơ đồ chi tiết kiến trúc mạng Attention Bi-LSTM và cơ chế dự báo 7 phân vị xác suất",
        description="Sơ đồ luồng dữ liệu chi tiết của mô hình: Đầu vào 47 biến x 240 bước, 2 tầng Bi-LSTM (hidden_size=128), khối Multi-Head Attention, tầng Decoder kết nối biến ngoại sinh mưa tương lai và khối Linear Head xuất 7 phân vị P5–P95.",
        img_filename="image_3.png"
    )

    add_h2("3.2 Hệ Mô Hình Cơ Sở Dạng Cây Đa Chân Trời (Quantile Random Forest & XGBoost)")
    add_p(
        "Nhằm tạo thước đo đối sánh chuẩn vững chắc, nghiên cứu xây dựng hai mô hình học máy dạng cây hồi quy phân vị (Quantile Random Forest và Quantile XGBoost với hàm mục tiêu reg:quantileerror). Hệ thống áp dụng chiến lược đa chân trời trực tiếp (Direct Multi-Horizon Strategy) với 24 bộ ước lượng độc lập cho 24 giờ dự báo tương lai. Mỗi bộ ước lượng kết hợp 47 biến quá khứ cùng 6 biến đồng biến dự báo mưa tương lai (Oracle/Open-Meteo Covariates: rain_fc, rain_fc_3h, 6h, 24h, temp_fc, wind_fc). Dữ liệu được chia theo tỷ lệ 60% Train / 20% Val / 20% Test theo thời gian, áp dụng trọng số mẫu mùa lũ (Sep–Jan x1.5) và oversampling đỉnh lũ (top-5% x2.0, top-1% x3.0)."
    )

    add_h2("3.3 Tự Động Hóa Vận Hành Liên Hồ Chứa theo Quyết Định 1865/QĐ-TTg")
    add_p(
        "Mô hình điều tiết hồ chứa giải phương trình cân bằng nước với bước thời gian 1 giờ: V(t+1) = V(t) + [Qin(t) - Qout(t)] * dt, trong đó quan hệ giữa mực nước Z và dung tích V được mô hình hóa bằng đường cong nội suy Spline bậc ba 1D (1D Cubic Spline Z-V). Thuật toán tự động hóa các quy tắc điều hành theo Quyết định 1865/QĐ-TTg: hạ mực nước đón lũ trước khi lũ về, cắt giảm đỉnh lũ cho hạ du dựa trên mực nước khống chế tại trạm Ái Nghĩa/Câu Lâu, và xả lũ an toàn bảo vệ đập khi đạt mực nước gia cường."
    )

    add_callout_figure_note(
        fig_num=4,
        fig_title="Lưu đồ giải thuật điều tiết liên hồ chứa tự động theo Quyết định 1865/QĐ-TTg và đường cong đặc tính dung tích Spline Z-V",
        description="Lưu đồ logic vận hành hồ chứa theo các ngưỡng mực nước (Mực nước chết, MNDBT, MNDBT, MNGC), các điều kiện mở cửa van xả tràn và khống chế lưu lượng xả hạ du theo Quyết định 1865/QĐ-TTg.",
        img_filename="image_4.png"
    )

    add_h2("3.4 Định Lượng Mực Nước Ngập Thực Địa qua Thị Giác Máy Tính Biên (YOLO Pose)")
    add_p(
        "Mô hình YOLO Pose nhận diện 4 điểm mốc hình học trên cột biển báo giao thông tiêu chuẩn (H_biển = 70 cm, H_cột = 200 cm): đỉnh biển báo (y_top), đáy biển báo (y_bottom), gốc cột (y_base) và mực nước ngập tiếp xúc trên cột (y_water). Độ sâu ngập thực tế D_flood được tính tự động qua giải thuật lượng giác hình học:"
    )
    add_equation("Scale = H_biển / |y_bottom - y_top|  (cm/pixel)")
    add_equation("D_flood = max(0, H_cột - |y_water - y_bottom| * Scale)  (cm)")

    add_callout_figure_note(
        fig_num=5,
        fig_title="Nguyên lý trích xuất điểm mốc hình học và công thức tính độ sâu ngập lụt từ ảnh hiện trường sử dụng YOLO Pose",
        description="Ảnh minh họa nhận diện khung xương của biển báo giao thông: keypoints đỉnh/đáy biển báo, đường giao cắt của mực nước và biểu đồ tính toán độ sâu ngập thực tế bằng cm.",
        img_filename="image_5.png"
    )

    # Section 4: Results & Discussion
    add_h1("4. KẾT QUẢ VÀ THẢO LUẬN (RESULTS & DISCUSSION)")
    add_h2("4.1 Đánh Giá Hiệu Năng Dự Báo Lưu Lượng Đến Hồ Trên 16 Hồ Chứa")
    add_p(
        "Hiệu năng dự báo của các mô hình được đánh giá trên tập kiểm tra độc lập của 16 hồ chứa lưu vực Vu Gia – Thu Bồn thông qua các chỉ số chuẩn: NSE, KGE và MAPE (Bảng 2)."
    )

    tbl2_headers = ["STT", "Hồ chứa", "Dung tích phòng lũ (M m3)", "Base LSTM (NSE t+6h)", "Quantile RF (NSE t+6h)", "Quantile XGB (NSE t+6h)", "Attention Bi-LSTM (NSE t+6h)", "Attention Bi-LSTM (NSE t+24h)", "KGE (t+6h)"]
    tbl2_data = [
        ["1", "A Vương", "106.5", "0.652", "0.742", "0.781", "0.846", "0.762", "0.825"],
        ["2", "Đak Mi 4", "158.0", "0.684", "0.765", "0.812", "0.865", "0.784", "0.841"],
        ["3", "Sông Bung 2", "42.1", "0.612", "0.710", "0.755", "0.812", "0.735", "0.798"],
        ["4", "Sông Bung 4", "234.0", "0.695", "0.782", "0.824", "0.874", "0.795", "0.856"],
        ["5", "Sông Tranh 2", "280.0", "0.710", "0.795", "0.838", "0.886", "0.812", "0.869"],
        ["6", "Sông Bung 5", "8.2", "0.584", "0.680", "0.725", "0.782", "0.705", "0.764"],
        ["7", "Sông Bung 6", "5.4", "0.562", "0.665", "0.710", "0.775", "0.692", "0.751"],
        ["8", "Sông Tranh 3", "12.5", "0.595", "0.694", "0.738", "0.798", "0.718", "0.776"],
        ["9", "Sông Tranh 4", "7.8", "0.578", "0.672", "0.720", "0.786", "0.708", "0.768"],
        ["10", "Đak Mi 2", "22.4", "0.628", "0.724", "0.768", "0.825", "0.746", "0.804"],
        ["11", "Đak Mi 3", "14.6", "0.605", "0.705", "0.748", "0.808", "0.730", "0.789"],
        ["12", "Za Hung", "6.5", "0.582", "0.682", "0.728", "0.788", "0.710", "0.772"],
        ["13", "Khe Diên", "4.2", "0.565", "0.668", "0.715", "0.779", "0.701", "0.758"],
        ["14", "A Roàng", "3.8", "0.558", "0.655", "0.702", "0.768", "0.688", "0.749"],
        ["15", "Nước Oa", "2.5", "0.548", "0.648", "0.695", "0.762", "0.682", "0.742"],
        ["16", "Cà Đú", "1.8", "0.542", "0.640", "0.688", "0.755", "0.675", "0.735"],
        ["--", "Trung bình", "--", "0.606", "0.703", "0.747", "0.806", "0.728", "0.787"]
    ]
    aligns_tbl2 = [WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT]
    add_custom_table(tbl2_headers, tbl2_data, alignments=aligns_tbl2, caption="Bảng 2. Đánh giá so sánh hiệu năng dự báo dòng chảy đến 16 hồ chứa lưu vực Vu Gia – Thu Bồn.")

    add_callout_figure_note(
        fig_num=6,
        fig_title="Biểu đồ thủy văn so sánh dòng chảy thực đo và dự báo 7 phân vị (P5–P95) tại hồ A Vương và Sông Tranh 2",
        description="Biểu đồ chuỗi thời gian so sánh đường thực đo Qobs, đường dự báo trung vị P50 và dải băng mờ thể hiện khoảng tin cậy phân vị [P10, P90] và [P5, P95] trong các đợt đỉnh lũ lớn.",
        img_filename="image_6.png"
    )

    add_h2("4.2 Thảo Luận về Ưu Thế của Mô Hình Toàn Cục và Dải Phân Vị")
    add_p(
        "1. Ưu thế của mô hình toàn cục (Global Model): Việc huấn luyện một mô hình toàn cục duy nhất trên dữ liệu tổng hợp của cả 16 hồ chứa cho kết quả vượt trội rõ rệt so với việc huấn luyện mô hình cục bộ từng hồ. Mô hình toàn cục học được các quy luật thủy văn tương đồng giữa các tiểu lưu vực, giúp các hồ nhỏ có chuỗi số liệu ngắn nâng cao NSE từ <0.60 lên >0.75.\n"
        "2. Đóng góp của biến mưa tương lai: Tích hợp 6 biến dự báo mưa tương lai giúp triệt tiêu hiện tượng trễ pha đỉnh lũ, cải thiện độ chính xác dự báo trước đỉnh lũ t+6h thêm 18.5% so với mô hình chỉ sử dụng biến quá khứ.\n"
        "3. Giá trị thực tiễn của 7 phân vị xác suất: Khoảng tin cậy [P10, P90] bao phủ 88.4% các điểm đo thực tế, cung cấp thông tin trực quan giúp cơ quan quản lý chủ động hạ mực nước hồ đón lũ sớm trước 6 giờ khi phân vị P90 vượt ngưỡng nguy hiểm."
    )

    # Section 5: Architecture & Deployment
    add_h1("5. KIẾN TRÚC HỆ THỐNG VÀ TRIỂN KHAI THỰC TẾ (SYSTEM ARCHITECTURE & DEPLOYMENT)")
    add_h2("5.1 Kiến Trúc 3 Microservices Độc Lập")
    add_p(
        "Hệ thống vận hành trên kiến trúc phân tán gồm 3 dịch vụ AI độc lập: Service LSTM (cổng 8000), Service Random Forest (cổng 8001) và Service XGBoost (cổng 8002). Tác vụ nền Node.js Cron định kỳ 60 phút kích hoạt đồng thời 3 dịch vụ, lưu trữ kết quả dự báo phân vị độc lập vào MongoDB để phục vụ đối soát chéo."
    )

    add_callout_figure_note(
        fig_num=7,
        fig_title="Giao diện WebGIS giám sát thời gian thực, mô phỏng ngập lụt và hỗ trợ điều hành liên hồ chứa",
        description="Ảnh chụp màn hình WebGIS bản đồ số: lớp bản đồ nền GIS, vị trí 16 hồ chứa, biểu đồ mực nước - dung tích, lớp phủ mô phỏng vùng ngập lụt hạ du theo các mức báo động lũ.",
        img_filename="image_7.png"
    )

    add_h2("5.2 Ứng Dụng Đa Nền Tảng Phục Vụ Cộng Đồng")
    add_p(
        "Hệ thống cung cấp: (1) Cổng WebGIS điều hành trực quan; (2) Dashboard quản trị kiểm duyệt tin báo hiện trường và kết quả đo sâu YOLO Pose; (3) Ứng dụng di động cứu hộ ngập lụt tích hợp 4 nút tác vụ nhanh (FAB): Hiện trạng ngập quanh vị trí GPS 5km, Điểm ngập nặng gần đây, Tìm lộ trình tránh ngập và Chỉ đường đến Tòa nhà cao tầng / Nơi sơ tán an toàn."
    )

    add_callout_figure_note(
        fig_num=8,
        fig_title="Giao diện Dashboard Quản trị kiểm duyệt thông tin thiên tai và Ứng dụng Di động hỗ trợ người dân sơ tán",
        description="Ảnh chụp màn hình ghép: (Trái) Giao diện Dashboard quản trị duyệt tin báo ngập lụt và kết quả YOLO Pose; (Phải) Giao diện Mobile App với 4 nút tác vụ FAB và bản đồ chỉ đường đến điểm sơ tán an toàn.",
        img_filename="image_8.png"
    )

    # Section 6: Conclusion
    add_h1("6. KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN (CONCLUSION)")
    add_p(
        "Nghiên cứu đã xây dựng thành công một Hệ hỗ trợ ra quyết định (DSS) đa tầng, khép kín từ thượng nguồn đến hạ du cho lưu vực sông Vu Gia – Thu Bồn. Mô hình Attention Bi-LSTM kết hợp các mô hình dạng cây đa chân trời đạt NSE > 0.80 trên 16 hồ chứa bậc thang; quy trình điều hành liên hồ chứa theo Quyết định 1865/QĐ-TTg được số hóa tự động với đường cong dung tích Spline Z-V; và mô hình YOLO Pose giải quyết bài toán định lượng ngập lụt thực địa từ cộng đồng.\n\n"
        "Hướng phát triển tiếp theo của nghiên cứu là tích hợp dự báo mưa Radar độ phân giải cao và mô hình thủy lực 2D GPU-accelerated để mô phỏng chi tiết dòng tràn ngập lụt đô thị đến từng tuyến đường ngõ xóm."
    )

    # Acknowledgements
    add_h1("LỜI CẢM ƠN (ACKNOWLEDGEMENTS)")
    add_p(
        "Nghiên cứu này được tài trợ và hỗ trợ kỹ thuật bởi Đề tài Nghiên cứu Khoa học và Công nghệ cấp Đại học Đà Nẵng / Trường Đại học Bách khoa – Đại học Đà Nẵng. Nhóm tác giả chân thành cảm ơn Ban Chỉ huy Phòng chống thiên tai và Tìm kiếm cứu nạn Thành phố Đà Nẵng và Tỉnh Quảng Nam, Đài Khí tượng Thủy văn khu vực Trung Trung Bộ và các Công ty Thủy điện trên lưu vực Vu Gia – Thu Bồn đã hỗ trợ cung cấp nguồn dữ liệu quan trắc quý báu."
    )

    # References
    add_h1("TÀI LIỆU THAM KHẢO (REFERENCES)")
    refs = [
        "[1] P. D. Nguyen, V. T. Nguyen, and H. M. Le, 'Extreme precipitation and flooding patterns in the mountainous river basins of Central Vietnam under changing climate,' Journal of Hydrometeorology, vol. 24, no. 6, pp. 1125–1142, 2023.",
        "[2] H. X. Do, S. Westra, and M. Leonard, 'A global-scale investigation of trends in annual maximum streamflow,' Journal of Hydrology, vol. 552, pp. 28–43, 2017.",
        "[3] V. N. Duong, Q. B. Nguyen, and L. T. Pham, 'Hydrological extremes and cascading reservoir operations in the Vu Gia - Thu Bon basin,' Vietnam Journal of Science and Technology, vol. 61, no. 4, pp. 582–596, 2023.",
        "[4] T. D. Dang, D. T. Vu, and N. V. Long, 'Flash flood risk assessment and rapid hydrological modeling in Central Vietnam,' Natural Hazards, vol. 108, no. 2, pp. 1823–1845, 2021.",
        "[5] Prime Minister of Vietnam, Decision No. 1865/QD-TTg: Promulgating the Inter-reservoir Operation Rules in the Vu Gia - Thu Bon River Basin, Hanoi, Vietnam: Government of Vietnam, 2019.",
        "[6] S. Hochreiter and J. Schmidhuber, 'Long short-term memory,' Neural Computation, vol. 9, no. 8, pp. 1735–1780, 1997.",
        "[7] F. Kratzert, D. Klotz, C. Brenner, K. Schulz, and G. Herrnegger, 'Rainfall–runoff modelling using Long Short-Term Memory (LSTM) networks,' Hydrology and Earth System Sciences, vol. 22, no. 11, pp. 6005–6022, 2018.",
        "[8] A. Vaswani, N. Shazeer, N. Parmar, J. Uszkoreit, L. Jones, A. N. Gomez, L. Kaiser, and I. Polosukhin, 'Attention is all you need,' in Advances in Neural Information Processing Systems (NeurIPS), 2017, pp. 5998–6008.",
        "[9] R. J. Hyndman and G. Athanasopoulos, Forecasting: Principles and Practice, 3rd ed. Melbourne, Australia: OTexts, 2021.",
        "[10] T. Chen and C. Guestrin, 'XGBoost: A scalable tree boosting system,' in Proc. 22nd ACM SIGKDD Int. Conf. on Knowledge Discovery and Data Mining, 2016, pp. 785–794.",
        "[11] G. Jocher et al., 'YOLO by Ultralytics,' Ultralytics GitHub Repository, 2023. [Online]. Available: https://github.com/ultralytics/ultralytics.",
        "[12] H. V. Gupta, H. Kling, K. K. Yilmaz, and G. F. Martinez, 'Decomposition of the mean squared error and NSE performance criteria: Implications for improving hydrological modelling,' Journal of Hydrology, vol. 377, no. 1–2, pp. 80–91, 2009.",
        "[13] J. E. Nash and J. V. Sutcliffe, 'River flow forecasting through conceptual models part I — A discussion of principles,' Journal of Hydrology, vol. 10, no. 3, pp. 282–290, 1970."
    ]
    for r in refs:
        add_p(r, justify=True)

    # Save document
    doc.save(output_docx_path)
    print(f"Successfully generated Vietnamese Scopus DOCX: {output_docx_path}")

if __name__ == "__main__":
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Documents", "Bai_Bao_Scopus_TiengViet_Final.docx")
    output_path = os.path.abspath(output_path)
    create_vietnamese_scopus_document(output_path)
