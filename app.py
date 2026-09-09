from datetime import date, timedelta, datetime
import os
import re
import smtplib
from email.message import EmailMessage
from functools import wraps
from pathlib import Path
from io import BytesIO
from flask import Flask, request, jsonify, session, send_from_directory, send_file, Response, redirect
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import mysql.connector
from mysql.connector import Error

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-key")
app.permanent_session_lifetime = timedelta(days=7)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
CORS(app, supports_credentials=True)

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", "Sujith@2005"),
    "database": os.environ.get("DB_NAME", "sarvathaa_courses"),
}
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "sarvathaa_admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Sarvathaa@2026!")

EMAIL_CONFIG = {
    "host": os.environ.get("SMTP_HOST", ""),
    "port": int(os.environ.get("SMTP_PORT", "587")),
    "username": os.environ.get("SMTP_USERNAME", ""),
    "password": os.environ.get("SMTP_PASSWORD", ""),
    "from_email": os.environ.get("SMTP_FROM_EMAIL", os.environ.get("SMTP_USERNAME", "")),
    "from_name": os.environ.get("SMTP_FROM_NAME", "Sarvathaa Team"),
    "use_tls": os.environ.get("SMTP_USE_TLS", "true").lower() not in ("0", "false", "no"),
}


def money_number(value):
    """Convert price strings like ₹599 or 599 to a float."""
    raw = ''.join(ch for ch in str(value or '') if ch.isdigit() or ch == '.')
    try:
        return float(raw) if raw else 0.0
    except ValueError:
        return 0.0

def money_rupees(value):
    amount = round(float(value or 0))
    return f"₹{amount}"

def coupon_to_json(coupon):
    if not coupon:
        return None
    result = dict(coupon)
    for key in ("start_date", "expiry_date"):
        if result.get(key):
            result[key] = result[key].isoformat()
    if result.get("created_at"):
        result["created_at"] = result["created_at"].isoformat()
    result["discount_value"] = float(result.get("discount_value") or 0)
    result["is_active"] = bool(result.get("is_active"))
    return result

def calculate_coupon_discount(original_price, coupon):
    original = money_number(original_price)
    discount_value = float(coupon.get("discount_value") or 0)
    discount_type = (coupon.get("discount_type") or "percent").lower()
    if discount_type == "amount":
        discount = min(original, discount_value)
    else:
        discount = original * discount_value / 100
    final = max(0, original - discount)
    return {
        "original_price": round(original, 2),
        "discount_amount": round(discount, 2),
        "final_price": round(final, 2),
        "original_price_text": money_rupees(original),
        "discount_amount_text": money_rupees(discount),
        "final_price_text": money_rupees(final),
    }

def build_course_login_message(login):
    login_link = os.environ.get("PUBLIC_LOGIN_URL", "https://www.sarvathaa.com/course-login.html")
    return f"""Hi {login.get('name') or 'Student'},

Your Sarvathaa course access is activated.

Course: {login.get('course_title') or login.get('course_key') or ''}
Login Link: {login_link}
Username: {login.get('username') or ''}
Password: {login.get('password') or login.get('access_password') or ''}
Access Valid Until: {login.get('expiry_date') or ''}

Regards,
Sarvathaa Team"""

def send_course_login_email(login):
    to_email = (login.get("email") or "").strip()
    if not to_email:
        return False, "No student email entered"
    if not EMAIL_CONFIG["host"] or not EMAIL_CONFIG["from_email"]:
        return False, "SMTP not configured; WhatsApp sending is still ready"

    msg = EmailMessage()
    msg["Subject"] = "Sarvathaa Course Login Details"
    msg["From"] = f'{EMAIL_CONFIG["from_name"]} <{EMAIL_CONFIG["from_email"]}>'
    msg["To"] = to_email
    msg.set_content(build_course_login_message(login))

    try:
        with smtplib.SMTP(EMAIL_CONFIG["host"], EMAIL_CONFIG["port"], timeout=20) as server:
            if EMAIL_CONFIG["use_tls"]:
                server.starttls()
            if EMAIL_CONFIG["username"] and EMAIL_CONFIG["password"]:
                server.login(EMAIL_CONFIG["username"], EMAIL_CONFIG["password"])
            server.send_message(msg)
        return True, f"Email sent to {to_email}"
    except Exception as exc:
        return False, f"Email not sent: {exc}"


COURSES = {
    "silver": {"title": "Silver Plan", "price": "₹2,999", "image": "assets/savaratha/inside pics/bake to business.jpeg"},
    "bronze": {"title": "Bronze Plan", "price": "₹3,999", "image": "assets/savaratha/inside pics/bake to business.jpeg"},
    "gold": {"title": "Gold Plan", "price": "₹5,999", "image": "assets/savaratha/inside pics/bake to business.jpeg"},
    "platinum": {"title": "Platinum Plan", "price": "₹9,999", "image": "assets/savaratha/inside pics/bake to business.jpeg"},
}

# Course lesson structure. Replace the embed links with your real private/unlisted course video links later.


# Private course note files.
# Put your real PDF/image files inside private_course_docs/.
# These files are NOT public assets; Flask opens them only after student login,
# completed mandatory form, active course access, and correct purchased course.
COURSE_DOCUMENT_FILES = {
    "silver": "silver-plan-notes.pdf",
    "bronze": "bronze-plan-notes.pdf",
    "gold": "gold-plan-notes.pdf",
    "platinum": "platinum-plan-notes.pdf",
}

COURSE_DOCUMENT_PAGE_COUNTS = {"silver": 2, "bronze": 2, "gold": 2, "platinum": 2}


# Excel-style course calculators shown inside each paid course login.
# Customers can calculate online only. No Excel/PDF download button is provided.
# Formula used on the customer page:
#   Total Qty = Qty Per Batch/Student/Piece x Count
#   Final Qty = Total Qty + Wastage %
#   Cost Used = Final Qty / Pack Size x Pack Price
COURSE_CALCULATIONS = {
    "piping": {
        "mode_label": "How many students / practice sets?",
        "default_count": 1,
        "items": [
            {"name": "Whipping Cream", "type": "Ingredient", "qty": 250, "unit": "g", "wastage": 10, "pack_size": 1000, "pack_price": 220},
            {"name": "Icing Sugar", "type": "Ingredient", "qty": 50, "unit": "g", "wastage": 5, "pack_size": 1000, "pack_price": 90},
            {"name": "Piping Gel", "type": "Ingredient", "qty": 20, "unit": "g", "wastage": 5, "pack_size": 500, "pack_price": 120},
            {"name": "Piping Bags", "type": "Tool", "qty": 2, "unit": "pcs", "wastage": 0, "pack_size": 1, "pack_price": 8},
            {"name": "Practice Cupcakes", "type": "Practice Base", "qty": 4, "unit": "pcs", "wastage": 0, "pack_size": 1, "pack_price": 18},
            {"name": "Nozzle Set", "type": "Reusable Tool", "qty": 1, "unit": "set", "wastage": 0, "pack_size": 1, "pack_price": 120},
        ]
    },
    "chocolate-garnish": {
        "mode_label": "How many students / garnish sets?",
        "default_count": 1,
        "items": [
            {"name": "Dark Chocolate Compound", "type": "Ingredient", "qty": 150, "unit": "g", "wastage": 8, "pack_size": 1000, "pack_price": 280},
            {"name": "White Chocolate Compound", "type": "Ingredient", "qty": 80, "unit": "g", "wastage": 8, "pack_size": 1000, "pack_price": 300},
            {"name": "Cocoa Butter / Color", "type": "Ingredient", "qty": 10, "unit": "g", "wastage": 5, "pack_size": 100, "pack_price": 250},
            {"name": "Butter Paper / Acetate Sheet", "type": "Consumable", "qty": 2, "unit": "sheets", "wastage": 0, "pack_size": 1, "pack_price": 12},
            {"name": "Chocolate Scraper", "type": "Reusable Tool", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 80},
        ]
    },
    "baking": {
        "mode_label": "How many cakes / batches?",
        "default_count": 1,
        "items": [
            {"name": "Maida", "type": "Ingredient", "qty": 200, "unit": "g", "wastage": 5, "pack_size": 1000, "pack_price": 60},
            {"name": "Sugar", "type": "Ingredient", "qty": 180, "unit": "g", "wastage": 5, "pack_size": 1000, "pack_price": 55},
            {"name": "Butter / Oil", "type": "Ingredient", "qty": 120, "unit": "g", "wastage": 5, "pack_size": 500, "pack_price": 250},
            {"name": "Egg / Egg Replacer", "type": "Ingredient", "qty": 3, "unit": "pcs", "wastage": 0, "pack_size": 1, "pack_price": 7},
            {"name": "Baking Powder", "type": "Ingredient", "qty": 8, "unit": "g", "wastage": 5, "pack_size": 100, "pack_price": 45},
            {"name": "Cake Tin / Mould", "type": "Reusable Tool", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 250},
        ]
    },
    "icing-cake": {
        "mode_label": "How many cakes?",
        "default_count": 1,
        "items": [
            {"name": "Whipping Cream", "type": "Ingredient", "qty": 350, "unit": "g", "wastage": 10, "pack_size": 1000, "pack_price": 220},
            {"name": "Cake Sponge", "type": "Base", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 120},
            {"name": "Sugar Syrup", "type": "Ingredient", "qty": 80, "unit": "ml", "wastage": 5, "pack_size": 1000, "pack_price": 70},
            {"name": "Cake Board", "type": "Packaging", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 18},
            {"name": "Palette Knife", "type": "Reusable Tool", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 110},
        ]
    },
    "creams": {
        "mode_label": "How many students / cream batches?",
        "default_count": 1,
        "items": [
            {"name": "Whipping Cream", "type": "Ingredient", "qty": 250, "unit": "g", "wastage": 10, "pack_size": 1000, "pack_price": 220},
            {"name": "Fresh Cream", "type": "Ingredient", "qty": 150, "unit": "g", "wastage": 8, "pack_size": 1000, "pack_price": 180},
            {"name": "Icing Sugar", "type": "Ingredient", "qty": 40, "unit": "g", "wastage": 5, "pack_size": 1000, "pack_price": 90},
            {"name": "Vanilla Essence", "type": "Ingredient", "qty": 5, "unit": "ml", "wastage": 0, "pack_size": 100, "pack_price": 70},
            {"name": "Mixing Bowl", "type": "Reusable Tool", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 160},
        ]
    },
    "mousselines": {
        "mode_label": "How many dessert batches?",
        "default_count": 1,
        "items": [
            {"name": "Milk", "type": "Ingredient", "qty": 250, "unit": "ml", "wastage": 5, "pack_size": 1000, "pack_price": 65},
            {"name": "Butter", "type": "Ingredient", "qty": 80, "unit": "g", "wastage": 5, "pack_size": 500, "pack_price": 250},
            {"name": "Sugar", "type": "Ingredient", "qty": 70, "unit": "g", "wastage": 5, "pack_size": 1000, "pack_price": 55},
            {"name": "Corn Flour", "type": "Ingredient", "qty": 25, "unit": "g", "wastage": 5, "pack_size": 500, "pack_price": 80},
            {"name": "Whisk", "type": "Reusable Tool", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 120},
        ]
    },
    "ganache": {
        "mode_label": "How many cakes / ganache batches?",
        "default_count": 1,
        "items": [
            {"name": "Dark Chocolate", "type": "Ingredient", "qty": 200, "unit": "g", "wastage": 8, "pack_size": 1000, "pack_price": 320},
            {"name": "Fresh Cream", "type": "Ingredient", "qty": 120, "unit": "g", "wastage": 8, "pack_size": 1000, "pack_price": 180},
            {"name": "Butter", "type": "Ingredient", "qty": 20, "unit": "g", "wastage": 5, "pack_size": 500, "pack_price": 250},
            {"name": "Piping Bag", "type": "Tool", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 8},
            {"name": "Spatula", "type": "Reusable Tool", "qty": 1, "unit": "pc", "wastage": 0, "pack_size": 1, "pack_price": 100},
        ]
    },
}


COURSE_LESSONS = {
    plan: [
        {"title": f"{label} - Sample Lesson 1: Baking Foundations", "url": "assets/videos/sample-lesson-1.mp4"},
        {"title": f"{label} - Sample Lesson 2: Decoration Basics", "url": "assets/videos/sample-lesson-2.mp4"},
    ]
    for plan, label in [
        ("silver", "Silver Plan"),
        ("bronze", "Bronze Plan"),
        ("gold", "Gold Plan"),
        ("platinum", "Platinum Plan"),
    ]
}


def quiz_question(question, options, answer):
    return {"question": question, "options": options, "answer": answer}


# Ten plan-specific questions per plan. The correct answer index stays only on the server.
PLAN_QUIZZES = {
    "silver": [
        quiz_question("Why should an oven be preheated before baking?", ["To cool the baking tin", "To reach the required baking temperature", "To reduce ingredient weight", "To avoid mixing"], 1),
        quiz_question("Which tool gives the most accurate flour measurement?", ["Digital weighing scale", "Serving spoon", "Tea cup", "Cake knife"], 0),
        quiz_question("What is the main purpose of baking powder?", ["Add colour", "Make the product rise", "Reduce sweetness", "Cool the batter"], 1),
        quiz_question("Why are room-temperature ingredients often recommended for cake batter?", ["They combine more evenly", "They remove all sugar", "They stop the oven", "They make flour heavier"], 0),
        quiz_question("What happens during the creaming method?", ["Flour and water are boiled", "Butter and sugar trap air", "Cake is frozen", "Chocolate is tempered"], 1),
        quiz_question("Which is a reliable sign that a basic cake is baked?", ["The centre is liquid", "A skewer comes out clean", "The tin is cold", "The batter becomes darker before baking"], 1),
        quiz_question("Why should a cake cool before icing?", ["Warm cake can melt the icing", "Cooling increases raw flour", "Cooling removes the cake", "Warm cake is always harder"], 0),
        quiz_question("What should be done before handling ingredients?", ["Touch the phone", "Wash and dry hands", "Open all packages", "Taste every ingredient"], 1),
        quiz_question("Why is parchment paper used in a cake tin?", ["To increase oven heat", "To help prevent sticking", "To add sugar", "To replace the cake tin"], 1),
        quiz_question("What improves consistency when repeating a recipe?", ["Changing quantities each time", "Using weighed ingredients and the same method", "Ignoring oven temperature", "Mixing without timing"], 1),
    ],
    "bronze": [
        quiz_question("Which cream condition is best for whipping?", ["Warm cream", "Cold cream", "Boiling cream", "Frozen solid cream"], 1),
        quiz_question("What is the purpose of a crumb coat?", ["Trap loose crumbs before final icing", "Bake the cake again", "Make the cake raw", "Replace the filling"], 0),
        quiz_question("What is the safest way to melt chocolate?", ["Use gentle controlled heat", "Place it directly on a high flame", "Add water immediately", "Leave it in sunlight"], 0),
        quiz_question("Why should cookie dough sometimes be chilled?", ["To control excessive spreading", "To remove all flavour", "To melt the fat", "To increase oven size"], 0),
        quiz_question("What helps produce an even piping line?", ["Uneven pressure", "Steady pressure and movement", "A torn piping bag", "Very warm cream"], 1),
        quiz_question("Why must raw and ready-to-eat ingredients be kept separate?", ["To prevent cross-contamination", "To increase product price", "To reduce storage space", "To change colour"], 0),
        quiz_question("What does ganache mainly combine?", ["Chocolate and cream", "Flour and salt", "Water and yeast", "Oil and baking soda"], 0),
        quiz_question("Why should finished cream products be refrigerated when required?", ["To support food safety and stability", "To make them heavier", "To remove decoration", "To increase oven temperature"], 0),
        quiz_question("What information should be placed on a stored preparation?", ["Only the bowl colour", "Product name and preparation date", "Employee nickname only", "Nothing"], 1),
        quiz_question("Why is a digital scale preferred for recipe production?", ["It improves repeatable accuracy", "It changes flavour automatically", "It bakes the product", "It replaces hygiene"], 0),
    ],
    "gold": [
        quiz_question("Why is chocolate tempered?", ["To create stable shine and snap", "To add flour", "To freeze the mould", "To remove cocoa"], 0),
        quiz_question("What does folding achieve in a light mousse mixture?", ["Preserves incorporated air", "Removes all air", "Boils the cream", "Hardens the bowl"], 0),
        quiz_question("What is a smooth ganache an example of?", ["A stable emulsion", "Dry fermentation", "Frozen flour", "Caramel powder"], 0),
        quiz_question("What helps create sharp cake edges?", ["Controlled chilling and careful final coating", "Pouring water on icing", "Using a warm cake", "Skipping the crumb coat"], 0),
        quiz_question("When doubling a tested recipe, what should be checked?", ["Only the product name", "Ingredient scaling and equipment capacity", "The wall colour", "Nothing"], 1),
        quiz_question("What should product costing include?", ["Ingredients only", "Ingredients, packaging, labour and overheads", "Decoration colour only", "Customer name only"], 1),
        quiz_question("Why is shelf-life testing important?", ["To establish safe quality duration", "To make the oven larger", "To avoid labels", "To remove packaging"], 0),
        quiz_question("What is the benefit of a production schedule?", ["Coordinates batches, time and resources", "Increases random work", "Removes quality checks", "Stops inventory records"], 0),
        quiz_question("How should allergen information be handled?", ["Clearly identified and communicated", "Always hidden", "Removed from records", "Guessed after sale"], 0),
        quiz_question("What best supports professional product consistency?", ["Standard recipes and recorded processes", "Changing method every batch", "No measurements", "Unplanned oven settings"], 0),
    ],
    "platinum": [
        quiz_question("How is food-cost percentage commonly calculated?", ["Food cost divided by selling price multiplied by 100", "Selling price divided by quantity only", "Profit plus tax", "Packaging divided by time"], 0),
        quiz_question("What is gross profit for one product?", ["Selling price minus direct product cost", "Selling price plus direct cost", "Only the tax amount", "Total stock quantity"], 0),
        quiz_question("What should a sustainable selling price cover?", ["Costs, overheads and planned profit", "Ingredients only", "Packaging colour only", "Competitor name only"], 0),
        quiz_question("What does FIFO mean in inventory?", ["First In, First Out", "Final Item, Final Order", "Fast Invoice, Fast Output", "Food Inspection For Oven"], 0),
        quiz_question("What is a reorder level?", ["The stock point that triggers replenishment", "The final customer price", "A cake decoration style", "The daily attendance total"], 0),
        quiz_question("Why maintain batch records?", ["For traceability and quality control", "To hide production", "To remove expiry dates", "To avoid measurements"], 0),
        quiz_question("What is the purpose of brand positioning?", ["Define how the business should be understood by target customers", "Increase oven temperature", "Replace product quality", "Avoid customer research"], 0),
        quiz_question("What should suitable bakery packaging protect?", ["Product safety, freshness and presentation", "Only the invoice", "Only the logo", "The oven tray"], 0),
        quiz_question("What is a good first response to a customer complaint?", ["Listen, record facts and respond professionally", "Delete the customer record", "Argue immediately", "Ignore the complaint"], 0),
        quiz_question("What is the break-even point?", ["Where total revenue equals total costs", "Where inventory becomes zero", "Where every sale is profit", "Where packaging is free"], 0),
    ],
}


def get_db():
    return mysql.connector.connect(**DB_CONFIG)

def get_student_profile(cur, student_id):
    cur.execute("""
        SELECT sp.*
        FROM student_profiles sp
        WHERE sp.student_id=%s
    """, (student_id,))
    return cur.fetchone()


def get_student_courses(cur, student_id, active_only=True):
    where_active = "AND sc.is_active=1" if active_only else ""
    cur.execute(f"""
        SELECT sc.id, sc.course_key, sc.expiry_date, sc.is_active, sc.created_at
        FROM student_courses sc
        WHERE sc.student_id=%s {where_active}
        ORDER BY sc.created_at ASC, sc.id ASC
    """, (student_id,))
    rows = cur.fetchall()
    today = date.today()
    courses = []
    for row in rows:
        key = (row.get('course_key') or '').strip()
        info = COURSES.get(key, {"title": key or "Course Access", "price": "Paid", "image": "assets/images/offline-training.svg"})
        videos = COURSE_LESSONS.get(key, [])
        courses.append({
            **info,
            "key": key,
            "course_key": key,
            "expiry_date": row['expiry_date'].isoformat() if row.get('expiry_date') else '',
            "is_active": bool(row.get('is_active')),
            "is_expired": bool(row.get('expiry_date') and row['expiry_date'] < today),
            "videos": videos,
            "document_url": f"/course-document/{key}" if COURSE_DOCUMENT_FILES.get(key) else "",
            "document_file": COURSE_DOCUMENT_FILES.get(key, ""),
            "has_document": bool(COURSE_DOCUMENT_FILES.get(key)),
            "quiz_url": f"/api/quiz/{key}" if PLAN_QUIZZES.get(key) else "",
            "quiz_question_count": len(PLAN_QUIZZES.get(key, [])),
            "calculation": COURSE_CALCULATIONS.get(key, {"mode_label": "No. of batches", "default_count": 1, "items": []}),
        })
    return courses


def has_active_course(cur, student_id):
    cur.execute("""
        SELECT id FROM student_courses
        WHERE student_id=%s AND is_active=1 AND expiry_date >= CURDATE()
        LIMIT 1
    """, (student_id,))
    return cur.fetchone() is not None


def init_db():
    con = mysql.connector.connect(host=DB_CONFIG["host"], user=DB_CONFIG["user"], password=DB_CONFIG["password"])
    cur = con.cursor()
    cur.execute(f"CREATE DATABASE IF NOT EXISTS {DB_CONFIG['database']} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    con.database = DB_CONFIG["database"]
    cur.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(160) DEFAULT '',
            phone VARCHAR(30) NOT NULL,
            username VARCHAR(80) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            access_password VARCHAR(120) DEFAULT NULL,
            course_key VARCHAR(80) NOT NULL,
            expiry_date DATE NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            profile_completed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Safe migrations for older databases.
    for statement in [
        "ALTER TABLE students ADD COLUMN access_password VARCHAR(120) DEFAULT NULL AFTER password_hash",
        "ALTER TABLE students ADD COLUMN profile_completed BOOLEAN DEFAULT FALSE AFTER is_active",
    ]:
        try:
            cur.execute(statement)
        except Error:
            pass

    cur.execute("""
        CREATE TABLE IF NOT EXISTS student_courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            course_key VARCHAR(80) NOT NULL,
            expiry_date DATE NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_student_course (student_id, course_key),
            CONSTRAINT fk_student_course_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    """)
    # Move old one-course records into the new multi-course table. Safe to run multiple times.
    try:
        cur.execute("""
            INSERT IGNORE INTO student_courses (student_id, course_key, expiry_date, is_active, created_at)
            SELECT id, course_key, expiry_date, is_active, created_at FROM students
        """)
    except Error:
        pass

    cur.execute("""
        CREATE TABLE IF NOT EXISTS student_profiles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL UNIQUE,
            full_name VARCHAR(160) NOT NULL,
            age INT NOT NULL,
            gender VARCHAR(40) NOT NULL,
            mobile_number VARCHAR(30) NOT NULL,
            email_address VARCHAR(180) NOT NULL,
            full_address TEXT NOT NULL,
            occupation VARCHAR(120) NOT NULL,
            why_course VARCHAR(180) NOT NULL,
            goal_after_course VARCHAR(180) NOT NULL,
            goal_timeline VARCHAR(120) NOT NULL,
            terms_accepted BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_student_profile_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS coupons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(50) NOT NULL UNIQUE,
            discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
            discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
            start_date DATE NOT NULL,
            expiry_date DATE NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Default launch coupon: 10% discount for 6 months. Safe to run many times.
    six_month_expiry = date.today() + timedelta(days=183)
    cur.execute("""
        INSERT IGNORE INTO coupons
        (code, discount_type, discount_value, start_date, expiry_date, is_active)
        VALUES (%s, 'percent', 10, CURDATE(), %s, TRUE)
    """, ('SARVATHAA10', six_month_expiry))

    cur.execute("""
        CREATE TABLE IF NOT EXISTS course_purchase_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            email VARCHAR(180) DEFAULT '',
            course_key VARCHAR(100) NOT NULL,
            original_price VARCHAR(40) DEFAULT '',
            coupon_code VARCHAR(50) DEFAULT '',
            discount_amount VARCHAR(40) DEFAULT '₹0',
            final_price VARCHAR(40) DEFAULT '',
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_purchase_phone (phone),
            INDEX idx_purchase_course (course_key),
            INDEX idx_purchase_status (status)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quiz_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            plan_key VARCHAR(50) NOT NULL,
            score INT NOT NULL,
            total_questions INT NOT NULL,
            percentage INT NOT NULL,
            passed BOOLEAN DEFAULT FALSE,
            attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_quiz_student_plan (student_id, plan_key),
            CONSTRAINT fk_quiz_attempt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    """)
    con.commit()
    cur.close()
    con.close()

@app.after_request
def add_security_headers(response):
    # Avoid old browser back-cache showing admin/student pages after logout.
    if request.path in ['/admin.html', '/admin-login.html', '/my-courses.html', '/course-login.html'] or request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return jsonify({"ok": False, "message": "Admin login required"}), 401
        return fn(*args, **kwargs)
    return wrapper

def get_logged_student():
    student_id = session.get('student_id')
    if not student_id:
        return None, (jsonify({"ok": False, "message": "Student login required"}), 401)
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("SELECT * FROM students WHERE id=%s AND is_active=1", (student_id,))
    student = cur.fetchone()
    cur.close(); con.close()
    if not student:
        return None, (jsonify({"ok": False, "message": "Student not found"}), 404)
    con = get_db(); cur = con.cursor(dictionary=True)
    active_course = has_active_course(cur, student_id)
    cur.close(); con.close()
    if not active_course:
        return None, (jsonify({"ok": False, "message": "Your course access expired. Contact Sarvathaa on WhatsApp."}), 403)
    return student, None


@app.route('/assets/videos/<path:filename>')
def protected_course_video(filename):
    student, error = get_logged_student()
    if error:
        return error
    if not student.get('profile_completed'):
        return jsonify({"ok": False, "message": "Complete the mandatory student information form before watching videos."}), 403

    # Security: a logged-in student can watch only videos assigned to any purchased active course.
    con = get_db(); cur = con.cursor(dictionary=True)
    purchased_courses = get_student_courses(cur, student['id'], active_only=True)
    cur.close(); con.close()
    allowed_videos = set()
    for course in purchased_courses:
        if course.get('is_expired'):
            continue
        for lesson in COURSE_LESSONS.get(course.get('course_key'), []):
            allowed_videos.add(Path(lesson['url']).name)
    requested_video = Path(filename).name
    if requested_video not in allowed_videos:
        return jsonify({"ok": False, "message": "This video is not included in your paid course access."}), 403

    return send_from_directory(BASE_DIR / 'assets' / 'videos', requested_video)


@app.route('/course-document/<course_key>')
def protected_course_document(course_key):
    """View-only course note page for the logged-in student who bought that course.
    The PDF is rendered as protected images to avoid the browser PDF toolbar/download button.
    """
    student, error = get_logged_student()
    if error:
        return error
    if not student.get('profile_completed'):
        return "Complete the mandatory student information form before opening course notes.", 403

    key = (course_key or '').strip().lower()
    doc_name = COURSE_DOCUMENT_FILES.get(key)
    if not doc_name:
        return "Course note is not added yet. Add your file inside private_course_docs folder.", 404

    con = get_db(); cur = con.cursor(dictionary=True)
    purchased_courses = get_student_courses(cur, student['id'], active_only=True)
    cur.close(); con.close()
    allowed = any((c.get('course_key') == key and not c.get('is_expired')) for c in purchased_courses)
    if not allowed:
        return "This course note is not included in your paid course access.", 403

    safe_name = Path(doc_name).stem
    page_count = COURSE_DOCUMENT_PAGE_COUNTS.get(key, 0)
    first_page = BASE_DIR / 'private_course_docs' / 'rendered' / safe_name / 'page-1.png'
    if page_count < 1 or not first_page.exists():
        return f"Course note image not found. Place your PDF and rendered pages here: private_course_docs/rendered/{safe_name}/", 404

    title = COURSES.get(key, {}).get('title', key.title())
    pages_html = ''.join(
        f'<section class="doc-page"><img src="/course-document-page/{key}/{i}" alt="{title} notes page {i}" draggable="false"></section>'
        for i in range(1, page_count + 1)
    )
    html = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} Course Notes</title>
<style>
  :root{{--bg:#fff8f4;--brown:#4b2d1f;--pink:#9d3153;}}
  html,body{{margin:0;background:var(--bg);font-family:Arial,Helvetica,sans-serif;color:var(--brown);user-select:none;}}
  body{{padding:14px;}}
  .viewer-head{{position:sticky;top:0;z-index:5;background:rgba(255,248,244,.96);backdrop-filter:blur(10px);border:1px solid rgba(157,49,83,.16);border-radius:16px;padding:12px 14px;margin:0 0 14px;display:flex;justify-content:space-between;gap:12px;align-items:center;}}
  .viewer-head h1{{font-size:18px;margin:0 0 3px;}}
  .viewer-head p{{margin:0;font-size:12px;color:#7a5d49;font-weight:700;}}
  .viewer-badge{{background:#fff;color:var(--pink);border:1px solid rgba(157,49,83,.20);border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;white-space:nowrap;}}
  .doc-page{{position:relative;max-width:920px;margin:0 auto 16px;background:#fff;border-radius:18px;box-shadow:0 12px 28px rgba(72,39,19,.12);overflow:hidden;border:1px solid rgba(122,67,27,.13);}}
  .doc-page img{{display:block;width:100%;height:auto;pointer-events:none;}}
  .doc-page:after{{content:'SARVATHAA STUDENT COPY';position:absolute;inset:auto 22px 18px auto;color:rgba(157,49,83,.18);font-weight:900;font-size:20px;letter-spacing:.08em;transform:rotate(-6deg);}}
  .no-copy-note{{max-width:920px;margin:8px auto 0;font-size:12px;color:#7a5d49;text-align:center;font-weight:700;}}
</style>
<script>
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {{
  const k = String(e.key || '').toLowerCase();
  if((e.ctrlKey || e.metaKey) && ['s','p','u','c','a'].includes(k)) e.preventDefault();
}});
</script></head><body>
<div class="viewer-head"><div><h1>{title} Course Notes</h1><p>Private student copy inside Sarvathaa login. Download and share buttons are not shown.</p></div><div class="viewer-badge">Private Reader</div></div>
{pages_html}
<div class="no-copy-note">Private learning document. Do not copy, share, download, forward, screenshot, or redistribute.</div>
</body></html>"""
    response = Response(html, mimetype='text/html')
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    return response


@app.route('/course-document-page/<course_key>/<int:page_no>')
def protected_course_document_page(course_key, page_no):
    """Protected rendered image page for course notes."""
    student, error = get_logged_student()
    if error:
        return error
    if not student.get('profile_completed'):
        return "Complete the mandatory student information form before opening course notes.", 403
    key = (course_key or '').strip().lower()
    doc_name = COURSE_DOCUMENT_FILES.get(key)
    if not doc_name:
        return "Course note is not added yet.", 404
    con = get_db(); cur = con.cursor(dictionary=True)
    purchased_courses = get_student_courses(cur, student['id'], active_only=True)
    cur.close(); con.close()
    allowed = any((c.get('course_key') == key and not c.get('is_expired')) for c in purchased_courses)
    if not allowed:
        return "This course note is not included in your paid course access.", 403
    safe_stem = Path(doc_name).stem
    page_count = COURSE_DOCUMENT_PAGE_COUNTS.get(key, 0)
    if page_no < 1 or page_no > page_count:
        return "Page not found", 404
    folder = BASE_DIR / 'private_course_docs' / 'rendered' / safe_stem
    response = send_from_directory(folder, f'page-{page_no}.png')
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    return response


@app.route('/')
def home():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/admin')
@app.route('/admin.html')
def admin_page():
    if not session.get('admin_logged_in'):
        return redirect('/course-login.html#admin-login')
    return send_from_directory(BASE_DIR, 'admin.html')

@app.route('/admin-login')
@app.route('/admin-login.html')
def admin_login_page():
    return redirect('/course-login.html#admin-login')

@app.route('/admin-logout', methods=['GET', 'POST'])
def admin_logout_page():
    session.pop('admin_logged_in', None)
    return redirect('/course-login.html#admin-login')


@app.route('/admin-setup-db')
def admin_setup_db():
    # Protected helper: run only when ADMIN_SETUP_TOKEN is set in VPS environment.
    # Recommended VPS method is still: mysql -u sarvathaa_user -p sarvathaa_courses < database.sql
    setup_token = os.environ.get("ADMIN_SETUP_TOKEN")
    if not setup_token or request.args.get("token") != setup_token:
        return "Not found", 404
    try:
        init_db()
        return "Database setup completed. Now go to /admin-login.html"
    except Exception as e:
        return f"Database setup failed: {e}", 500

@app.route('/<path:filename>')
def pages(filename):
    # Support both URL styles:
    #   /about.html and /about
    #   /course-login.html and /course-login
    # But keep admin protected.
    filename = filename.strip('/')

    admin_pages = {'admin', 'admin.html'}
    if filename in admin_pages and not session.get('admin_logged_in'):
        return redirect('/course-login.html#admin-login')

    if filename in {'admin-login', 'admin-login.html'}:
        return redirect('/course-login.html#admin-login')

    # Never expose backend source, SQL, raw course PDFs or rendered private-note files.
    blocked_suffixes = {'.py', '.sql', '.txt', '.pdf', '.env'}
    if filename.startswith('private_course_docs/') or Path(filename).suffix.lower() in blocked_suffixes:
        return 'File not found', 404

    direct_path = BASE_DIR / filename
    if filename.startswith('assets/') and direct_path.exists() and direct_path.is_file():
        return send_from_directory(BASE_DIR, filename)

    if '/' not in filename and filename.endswith('.html') and direct_path.exists() and direct_path.is_file():
        return send_from_directory(BASE_DIR, filename)

    # If user types URL without .html, serve matching html file.
    html_path = BASE_DIR / f'{filename}.html'
    if '/' not in filename and html_path.exists() and html_path.is_file():
        return send_from_directory(BASE_DIR, f'{filename}.html')

    # Do not silently show home page for unknown static asset paths.
    if '.' in filename:
        return 'File not found', 404

    return send_from_directory(BASE_DIR, 'index.html')


@app.errorhandler(500)
def internal_error(error):
    # Show a clear JSON message for API errors instead of a blank Server Error page.
    if request.path.startswith('/api/'):
        return jsonify({"ok": False, "message": "Server error. Check Flask terminal red error and confirm MySQL database/tables are updated."}), 500
    return "Server error. Check Flask terminal red error and restart the Flask app.", 500


@app.route('/api/course-purchase-request', methods=['POST'])
def course_purchase_request():
    data = request.get_json(force=True) or {}
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    email = (data.get('email') or '').strip()
    course = (data.get('course') or '').strip()
    original_price = (data.get('original_price') or '').strip()
    coupon_code = (data.get('coupon_code') or '').strip().upper()
    discount_amount = (data.get('discount_amount') or '₹0').strip()
    final_price = (data.get('final_price') or original_price).strip()

    if not name:
        return jsonify({"ok": False, "message": "Name is required."}), 400
    if not re.fullmatch(r'\d{10}', phone):
        return jsonify({"ok": False, "message": "Please enter a valid 10-digit WhatsApp number."}), 400
    if not course:
        return jsonify({"ok": False, "message": "Please select a course."}), 400

    allowed_courses = {
        "Silver Plan": "silver",
        "Bronze Plan": "bronze",
        "Gold Plan": "gold",
        "Platinum Plan": "platinum",
    }
    if course not in allowed_courses:
        return jsonify({"ok": False, "message": "Invalid course selected."}), 400

    # Recalculate coupon server-side so the browser cannot alter the payable amount.
    try:
        con = get_db()
        cur = con.cursor(dictionary=True)
        cur.execute("""
            SELECT * FROM coupons
            WHERE code=%s AND is_active=1
              AND start_date <= CURDATE()
              AND expiry_date >= CURDATE()
            LIMIT 1
        """, (coupon_code,)) if coupon_code else None
        coupon = cur.fetchone() if coupon_code else None

        if coupon_code and not coupon:
            cur.close(); con.close()
            return jsonify({"ok": False, "message": "Coupon is invalid or expired."}), 400

        if coupon:
            calc = calculate_coupon_discount(original_price, coupon)
            discount_amount = calc["discount_amount_text"]
            final_price = calc["final_price_text"]

        cur.close()
        con.close()
    except Error as e:
        return jsonify({"ok": False, "message": f"Database validation failed: {e}"}), 500

    try:
        con = get_db()
        cur = con.cursor()
        cur.execute("""
            INSERT INTO course_purchase_requests
            (name, phone, email, course_key, original_price, coupon_code, discount_amount, final_price, status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'pending')
        """, (
            name, phone, email, allowed_courses[course],
            original_price, coupon_code, discount_amount, final_price
        ))
        request_id = cur.lastrowid
        con.commit()
        cur.close()
        con.close()
        return jsonify({
            "ok": True,
            "request_id": request_id,
            "message": "Course purchase request saved successfully."
        })
    except Error as e:
        return jsonify({"ok": False, "message": f"Could not save request: {e}"}), 500

@app.route('/api/student-login', methods=['POST'])
def student_login():
    data = request.get_json(force=True)
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("SELECT * FROM students WHERE username=%s AND is_active=1", (username,))
    student = cur.fetchone()
    if not student or not check_password_hash(student['password_hash'], password):
        cur.close(); con.close()
        return jsonify({"ok": False, "message": "Wrong username or password"}), 401
    if not has_active_course(cur, student['id']):
        cur.close(); con.close()
        return jsonify({"ok": False, "message": "Your course access has expired. Contact Sarvathaa on WhatsApp."}), 403
    cur.close(); con.close()
    session.permanent = True
    session['student_id'] = student['id']
    return jsonify({"ok": True, "message": "Login successful"})

@app.route('/api/my-courses')
def my_courses():
    student_id = session.get('student_id')
    if not student_id:
        return jsonify({"ok": False, "message": "Student login required"}), 401
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("""
        SELECT id,name,email,phone,username,course_key,expiry_date,profile_completed
        FROM students
        WHERE id=%s AND is_active=1
    """, (student_id,))
    student = cur.fetchone()
    if not student:
        cur.close(); con.close()
        return jsonify({"ok": False, "message": "Student not found"}), 404

    purchased_courses = [c for c in get_student_courses(cur, student_id, active_only=True) if not c.get('is_expired')]
    cur.close(); con.close()
    if not purchased_courses:
        return jsonify({"ok": False, "message": "Your course access expired"}), 403

    all_videos = []
    for ck, lessons in COURSE_LESSONS.items():
        for lesson in lessons:
            all_videos.append({**lesson, "course_key": ck, "course_title": COURSES.get(ck, {}).get("title", ck)})

    first_course = purchased_courses[0]
    return jsonify({
        "ok": True,
        "student": {
            "name": student['name'],
            "expiry_date": max([c.get('expiry_date') or '' for c in purchased_courses]),
            "profile_completed": bool(student.get('profile_completed')),
        },
        "course": first_course,
        "courses": purchased_courses,
        "all_courses": [{**v, "key": k} for k, v in COURSES.items()],
        "all_videos": all_videos
    })


def require_student_plan(plan_key):
    student, error = get_logged_student()
    if error:
        return None, error
    if not student.get('profile_completed'):
        return None, (jsonify({"ok": False, "message": "Complete the student information form before opening the quiz."}), 403)
    if plan_key not in PLAN_QUIZZES:
        return None, (jsonify({"ok": False, "message": "Quiz not found."}), 404)
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("""
        SELECT id FROM student_courses
        WHERE student_id=%s AND course_key=%s AND is_active=1 AND expiry_date >= CURDATE()
        LIMIT 1
    """, (student['id'], plan_key))
    allowed = cur.fetchone() is not None
    cur.close(); con.close()
    if not allowed:
        return None, (jsonify({"ok": False, "message": "This quiz is not included in your activated plan."}), 403)
    return student, None


@app.route('/api/quiz/<plan_key>')
def get_plan_quiz(plan_key):
    plan_key = (plan_key or '').strip().lower()
    student, error = require_student_plan(plan_key)
    if error:
        return error
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("""
        SELECT MAX(percentage) AS best_percentage,
               MAX(CASE WHEN passed=1 THEN 1 ELSE 0 END) AS ever_passed,
               COUNT(*) AS attempt_count
        FROM quiz_attempts WHERE student_id=%s AND plan_key=%s
    """, (student['id'], plan_key))
    progress = cur.fetchone() or {}
    cur.close(); con.close()
    questions = [
        {"id": index, "question": item["question"], "options": item["options"]}
        for index, item in enumerate(PLAN_QUIZZES[plan_key])
    ]
    return jsonify({
        "ok": True,
        "plan_key": plan_key,
        "plan_title": COURSES[plan_key]["title"],
        "passing_percentage": 70,
        "questions": questions,
        "best_percentage": int(progress.get('best_percentage') or 0),
        "passed": bool(progress.get('ever_passed')),
        "attempt_count": int(progress.get('attempt_count') or 0),
    })


@app.route('/api/quiz/<plan_key>/submit', methods=['POST'])
def submit_plan_quiz(plan_key):
    plan_key = (plan_key or '').strip().lower()
    student, error = require_student_plan(plan_key)
    if error:
        return error
    data = request.get_json(force=True) or {}
    answers = data.get('answers')
    questions = PLAN_QUIZZES[plan_key]
    if not isinstance(answers, list) or len(answers) != len(questions):
        return jsonify({"ok": False, "message": "Please answer all 10 questions before submitting."}), 400
    try:
        normalized = [int(answer) for answer in answers]
    except (TypeError, ValueError):
        return jsonify({"ok": False, "message": "Invalid quiz answers."}), 400
    if any(answer < 0 or answer >= len(questions[index]['options']) for index, answer in enumerate(normalized)):
        return jsonify({"ok": False, "message": "Invalid quiz option selected."}), 400
    score = sum(1 for index, answer in enumerate(normalized) if answer == questions[index]['answer'])
    total = len(questions)
    percentage = round((score / total) * 100)
    passed = percentage >= 70
    con = get_db(); cur = con.cursor()
    cur.execute("""
        INSERT INTO quiz_attempts (student_id,plan_key,score,total_questions,percentage,passed)
        VALUES (%s,%s,%s,%s,%s,%s)
    """, (student['id'], plan_key, score, total, percentage, passed))
    con.commit(); cur.close(); con.close()
    return jsonify({
        "ok": True, "score": score, "total": total, "percentage": percentage, "passed": passed,
        "message": "Congratulations! You passed the plan quiz." if passed else "You need 70% to pass. Review the notes and try again."
    })


@app.route('/api/student/profile', methods=['GET'])
def student_profile_get():
    student, error = get_logged_student()
    if error:
        return error
    con = get_db(); cur = con.cursor(dictionary=True)
    profile = get_student_profile(cur, student['id'])
    cur.close(); con.close()
    if profile:
        for key in ['created_at', 'updated_at']:
            if profile.get(key):
                profile[key] = profile[key].isoformat()
    return jsonify({"ok": True, "profile_completed": bool(student.get('profile_completed')), "profile": profile})


@app.route('/api/student/profile', methods=['POST'])
def student_profile_save():
    student, error = get_logged_student()
    if error:
        return error
    data = request.get_json(force=True)
    required = ['full_name','age','gender','mobile_number','email_address','full_address','occupation','why_course','goal_after_course','goal_timeline']
    missing = [field for field in required if not str(data.get(field) or '').strip()]
    if missing or not data.get('terms_accepted'):
        return jsonify({"ok": False, "message": "All fields and confirmation checkbox are mandatory."}), 400
    try:
        age = int(data.get('age'))
        if age <= 0 or age > 120:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"ok": False, "message": "Please enter a valid age."}), 400

    values = (
        student['id'],
        data['full_name'].strip(), age, data['gender'].strip(), data['mobile_number'].strip(),
        data['email_address'].strip(), data['full_address'].strip(), data['occupation'].strip(),
        data['why_course'].strip(), data['goal_after_course'].strip(), data['goal_timeline'].strip(), True,
    )
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            INSERT INTO student_profiles
            (student_id, full_name, age, gender, mobile_number, email_address, full_address, occupation,
             why_course, goal_after_course, goal_timeline, terms_accepted)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                full_name=VALUES(full_name), age=VALUES(age), gender=VALUES(gender), mobile_number=VALUES(mobile_number),
                email_address=VALUES(email_address), full_address=VALUES(full_address), occupation=VALUES(occupation),
                why_course=VALUES(why_course), goal_after_course=VALUES(goal_after_course), goal_timeline=VALUES(goal_timeline),
                terms_accepted=VALUES(terms_accepted)
        """, values)
        cur.execute("UPDATE students SET profile_completed=1 WHERE id=%s", (student['id'],))
        con.commit(); cur.close(); con.close()
        return jsonify({"ok": True, "message": "Student information saved successfully. Your video is unlocked now."})
    except Error as e:
        return jsonify({"ok": False, "message": str(e)}), 400


@app.route('/api/student/check')
def student_check():
    return jsonify({"ok": bool(session.get("student_id"))})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"ok": True})

@app.route('/api/admin-login', methods=['POST'])
def admin_login():
    data = request.get_json(force=True)
    if (data.get('username') or '').strip() == ADMIN_USERNAME and (data.get('password') or '').strip() == ADMIN_PASSWORD:
        session.permanent = True
        session['admin_logged_in'] = True
        return jsonify({"ok": True})
    return jsonify({"ok": False, "message": "Wrong admin login"}), 401

@app.route('/api/admin/check')
def admin_check():
    return jsonify({"ok": bool(session.get("admin_logged_in"))})

@app.route('/api/coupons/validate', methods=['POST'])
def validate_coupon():
    data = request.get_json(force=True)
    code = (data.get('code') or '').strip().upper()
    price = data.get('price') or data.get('original_price') or 0
    course = (data.get('course') or '').strip()
    if not code:
        return jsonify({"ok": False, "message": "Enter coupon code."}), 400
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("SELECT * FROM coupons WHERE UPPER(code)=UPPER(%s) LIMIT 1", (code,))
    coupon = cur.fetchone(); cur.close(); con.close()
    today = date.today()
    if not coupon:
        return jsonify({"ok": False, "message": "Invalid coupon code."}), 404
    if not coupon.get('is_active'):
        return jsonify({"ok": False, "message": "This coupon is inactive."}), 400
    if coupon.get('start_date') and coupon['start_date'] > today:
        return jsonify({"ok": False, "message": "This coupon is not started yet."}), 400
    if coupon.get('expiry_date') and coupon['expiry_date'] < today:
        return jsonify({"ok": False, "message": "This coupon code has expired."}), 400
    calc = calculate_coupon_discount(price, coupon)
    return jsonify({"ok": True, "message": "Coupon applied successfully.", "coupon": coupon_to_json(coupon), "course": course, **calc})


@app.route('/api/admin/coupons')
@admin_required
def admin_list_coupons():
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("SELECT * FROM coupons ORDER BY id DESC")
    rows = cur.fetchall(); cur.close(); con.close()
    return jsonify({"ok": True, "coupons": [coupon_to_json(r) for r in rows]})


@app.route('/api/admin/coupons', methods=['POST'])
@admin_required
def admin_create_coupon():
    data = request.get_json(force=True)
    code = (data.get('code') or '').strip().upper().replace(' ', '')
    discount_type = (data.get('discount_type') or 'percent').strip().lower()
    if discount_type not in ('percent', 'amount'):
        discount_type = 'percent'
    try:
        discount_value = float(data.get('discount_value') or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "message": "Enter valid discount value."}), 400
    start_date = (data.get('start_date') or '').strip() or date.today().isoformat()
    expiry_date = (data.get('expiry_date') or '').strip()
    is_active = bool(data.get('is_active', True))
    if not code or discount_value <= 0 or not expiry_date:
        return jsonify({"ok": False, "message": "Coupon code, discount and expiry date are required."}), 400
    if discount_type == 'percent' and discount_value > 100:
        return jsonify({"ok": False, "message": "Percent discount cannot be above 100."}), 400
    try:
        con = get_db(); cur = con.cursor(dictionary=True)
        cur.execute("""
            INSERT INTO coupons (code, discount_type, discount_value, start_date, expiry_date, is_active)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                discount_type=VALUES(discount_type),
                discount_value=VALUES(discount_value),
                start_date=VALUES(start_date),
                expiry_date=VALUES(expiry_date),
                is_active=VALUES(is_active)
        """, (code, discount_type, discount_value, start_date, expiry_date, is_active))
        con.commit()
        cur.execute("SELECT * FROM coupons WHERE code=%s", (code,))
        coupon = cur.fetchone(); cur.close(); con.close()
        return jsonify({"ok": True, "message": "Coupon saved successfully.", "coupon": coupon_to_json(coupon)})
    except Error as e:
        return jsonify({"ok": False, "message": str(e)}), 400


@app.route('/api/admin/coupons/<int:coupon_id>/toggle', methods=['POST'])
@admin_required
def admin_toggle_coupon(coupon_id):
    data = request.get_json(force=True) if request.data else {}
    is_active = bool(data.get('is_active'))
    con = get_db(); cur = con.cursor()
    cur.execute("UPDATE coupons SET is_active=%s WHERE id=%s", (is_active, coupon_id))
    con.commit(); cur.close(); con.close()
    return jsonify({"ok": True, "message": "Coupon status updated."})


@app.route('/api/admin/coupons/<int:coupon_id>', methods=['DELETE'])
@admin_required
def admin_delete_coupon(coupon_id):
    con = get_db(); cur = con.cursor()
    cur.execute("DELETE FROM coupons WHERE id=%s", (coupon_id,))
    con.commit(); cur.close(); con.close()
    return jsonify({"ok": True, "message": "Coupon deleted."})


@app.route('/api/admin/purchase-requests')
@admin_required
def admin_purchase_requests():
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("""
        SELECT id,name,phone,email,course_key,original_price,coupon_code,
               discount_amount,final_price,status,created_at
        FROM course_purchase_requests
        ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, id DESC
    """)
    rows = cur.fetchall(); cur.close(); con.close()
    for row in rows:
        row['created_at'] = row['created_at'].isoformat() if row.get('created_at') else ''
        row['course_title'] = COURSES.get(row.get('course_key'), {}).get('title', row.get('course_key', ''))
    return jsonify({"ok": True, "requests": rows})


@app.route('/api/admin/purchase-requests/<int:request_id>/activate', methods=['POST'])
@admin_required
def activate_purchase_request(request_id):
    data = request.get_json(force=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    expiry_date = (data.get('expiry_date') or '').strip()
    if not username or len(password) < 6 or not expiry_date:
        return jsonify({"ok": False, "message": "Username, password (minimum 6 characters) and expiry date are required."}), 400
    try:
        con = get_db(); cur = con.cursor(dictionary=True)
        cur.execute("SELECT * FROM course_purchase_requests WHERE id=%s FOR UPDATE", (request_id,))
        purchase = cur.fetchone()
        if not purchase:
            cur.close(); con.close()
            return jsonify({"ok": False, "message": "Purchase request not found."}), 404
        if purchase.get('status') == 'activated':
            cur.close(); con.close()
            return jsonify({"ok": False, "message": "This request is already activated."}), 400
        course_key = (purchase.get('course_key') or '').strip()
        if course_key not in COURSES:
            cur.close(); con.close()
            return jsonify({"ok": False, "message": "This request does not contain a valid plan."}), 400

        password_hash = generate_password_hash(password)
        cur.execute("""
            INSERT INTO students
            (name,email,phone,username,password_hash,access_password,course_key,expiry_date,is_active)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,1)
        """, (purchase['name'], purchase.get('email') or '', purchase['phone'], username,
              password_hash, password, course_key, expiry_date))
        student_id = cur.lastrowid
        cur.execute("""
            INSERT INTO student_courses (student_id,course_key,expiry_date,is_active)
            VALUES (%s,%s,%s,1)
        """, (student_id, course_key, expiry_date))
        cur.execute("UPDATE course_purchase_requests SET status='activated' WHERE id=%s", (request_id,))
        con.commit(); cur.close(); con.close()

        login = {
            "name": purchase['name'], "email": purchase.get('email') or '', "phone": purchase['phone'],
            "username": username, "password": password, "course_key": course_key,
            "course_title": COURSES[course_key]['title'], "expiry_date": expiry_date,
        }
        email_sent, email_message = send_course_login_email(login)
        return jsonify({"ok": True, "message": "Student login created and plan activated.",
                        "login": login, "email_sent": email_sent, "email_message": email_message})
    except Error as e:
        try:
            con.rollback(); cur.close(); con.close()
        except Exception:
            pass
        return jsonify({"ok": False, "message": str(e)}), 400


@app.route('/api/admin/students')
@admin_required
def list_students():
    q = (request.args.get('q') or '').strip()
    params = []
    where = ''
    if q:
        where = "WHERE s.name LIKE %s OR s.phone LIKE %s OR s.email LIKE %s OR s.username LIKE %s OR sp.full_name LIKE %s OR sp.mobile_number LIKE %s"
        like = f"%{q}%"
        params = [like, like, like, like, like, like]
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute(f"""
        SELECT s.id,s.name,s.email,s.phone,s.username,s.access_password,s.course_key,s.expiry_date,
               s.is_active,s.profile_completed,s.created_at,
               sp.full_name,sp.age,sp.gender,sp.mobile_number,sp.email_address,sp.full_address,sp.occupation,
               sp.why_course,sp.goal_after_course,sp.goal_timeline,sp.updated_at AS profile_updated_at,
               GROUP_CONCAT(DISTINCT sc.course_key ORDER BY sc.created_at SEPARATOR ',') AS course_keys,
               GROUP_CONCAT(DISTINCT CONCAT(sc.course_key, '|', DATE_FORMAT(sc.expiry_date, '%Y-%m-%d')) ORDER BY sc.created_at SEPARATOR '||') AS course_pairs
        FROM students s
        LEFT JOIN student_profiles sp ON sp.student_id=s.id
        LEFT JOIN student_courses sc ON sc.student_id=s.id AND sc.is_active=1
        {where}
        GROUP BY s.id
        ORDER BY s.id DESC
    """, tuple(params))
    rows = cur.fetchall(); cur.close(); con.close()
    for r in rows:
        r['expiry_date'] = r['expiry_date'].isoformat() if r.get('expiry_date') else ''
        r['created_at'] = r['created_at'].isoformat() if r.get('created_at') else ''
        r['profile_updated_at'] = r['profile_updated_at'].isoformat() if r.get('profile_updated_at') else ''
        pairs = []
        for pair in (r.get('course_pairs') or '').split('||'):
            if not pair:
                continue
            key, _, exp = pair.partition('|')
            pairs.append({
                'key': key,
                'title': COURSES.get(key, {}).get('title', key),
                'expiry_date': exp,
            })
        if not pairs and r.get('course_key'):
            pairs = [{'key': r['course_key'], 'title': COURSES.get(r['course_key'], {}).get('title', r['course_key']), 'expiry_date': r.get('expiry_date') or ''}]
        r['courses'] = pairs
        r['course_title'] = ', '.join([p['title'] for p in pairs]) or COURSES.get(r.get('course_key'), {}).get('title', r.get('course_key', ''))
        r['profile_completed'] = bool(r.get('profile_completed'))
    return jsonify({"ok": True, "students": rows})


@app.route('/api/admin/students', methods=['POST'])
@admin_required
def add_student():
    data = request.get_json(force=True)
    required = ['name','phone','username','password','course_key','expiry_date']
    if not all(str(data.get(k) or '').strip() for k in required):
        return jsonify({"ok": False, "message": "Please fill all fields"}), 400
    if len(data.get('password') or '') < 6:
        return jsonify({"ok": False, "message": "Password must contain at least 6 characters."}), 400
    if data.get('course_key') not in COURSES:
        return jsonify({"ok": False, "message": "Please select Silver, Bronze, Gold or Platinum plan."}), 400
    password_hash = generate_password_hash(data['password'])
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""INSERT INTO students (name,email,phone,username,password_hash,access_password,course_key,expiry_date)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (data['name'], data.get('email',''), data['phone'], data['username'], password_hash, data['password'], data['course_key'], data['expiry_date']))
        student_id = cur.lastrowid
        cur.execute("""INSERT INTO student_courses (student_id, course_key, expiry_date, is_active)
                       VALUES (%s,%s,%s,1)
                       ON DUPLICATE KEY UPDATE expiry_date=VALUES(expiry_date), is_active=1""",
                    (student_id, data['course_key'], data['expiry_date']))
        con.commit(); cur.close(); con.close()
        login = {
            "name": data["name"],
            "email": data.get("email", ""),
            "phone": data["phone"],
            "username": data["username"],
            "password": data["password"],
            "course_key": data["course_key"],
            "course_title": COURSES.get(data["course_key"], {}).get("title", data["course_key"]),
            "expiry_date": data["expiry_date"],
        }
        email_sent, email_message = send_course_login_email(login)
        return jsonify({
            "ok": True,
            "message": "Student login created successfully",
            "login": login,
            "email_sent": email_sent,
            "email_message": email_message,
        })
    except Error as e:
        return jsonify({"ok": False, "message": str(e)}), 400


@app.route('/api/admin/students/<int:student_id>/courses', methods=['POST'])
@admin_required
def admin_add_student_course(student_id):
    data = request.get_json(force=True)
    course_key = (data.get('course_key') or '').strip()
    expiry_date = (data.get('expiry_date') or '').strip()
    if not course_key or not expiry_date:
        return jsonify({"ok": False, "message": "Select course and expiry date."}), 400
    if course_key not in COURSES:
        return jsonify({"ok": False, "message": "Invalid plan selected."}), 400
    try:
        con = get_db(); cur = con.cursor(dictionary=True)
        cur.execute("SELECT id,name,email,phone,username,access_password FROM students WHERE id=%s", (student_id,))
        student = cur.fetchone()
        if not student:
            cur.close(); con.close()
            return jsonify({"ok": False, "message": "Student not found"}), 404
        cur.execute("""
            INSERT INTO student_courses (student_id, course_key, expiry_date, is_active)
            VALUES (%s,%s,%s,1)
            ON DUPLICATE KEY UPDATE expiry_date=VALUES(expiry_date), is_active=1
        """, (student_id, course_key, expiry_date))
        cur.execute("""
            UPDATE students
            SET course_key=%s, expiry_date=GREATEST(expiry_date, %s)
            WHERE id=%s
        """, (course_key, expiry_date, student_id))
        con.commit(); cur.close(); con.close()
        login = {
            "name": student.get("name", ""),
            "email": student.get("email", ""),
            "phone": student.get("phone", ""),
            "username": student.get("username", ""),
            "password": student.get("access_password", "Same as your existing password"),
            "course_key": course_key,
            "course_title": COURSES.get(course_key, {}).get("title", course_key),
            "expiry_date": expiry_date,
        }
        email_sent, email_message = send_course_login_email(login)
        return jsonify({"ok": True, "message": "New course added to existing login", "login": login, "email_sent": email_sent, "email_message": email_message})
    except Error as e:
        return jsonify({"ok": False, "message": str(e)}), 400


@app.route('/api/admin/students/<int:student_id>')
@admin_required
def admin_student_details(student_id):
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute("""
        SELECT s.id,s.name,s.email,s.phone,s.username,s.access_password,s.course_key,s.expiry_date,
               s.is_active,s.profile_completed,s.created_at,
               sp.full_name,sp.age,sp.gender,sp.mobile_number,sp.email_address,sp.full_address,sp.occupation,
               sp.why_course,sp.goal_after_course,sp.goal_timeline,sp.terms_accepted,sp.created_at AS profile_created_at,sp.updated_at AS profile_updated_at
        FROM students s
        LEFT JOIN student_profiles sp ON sp.student_id=s.id
        WHERE s.id=%s
    """, (student_id,))
    row = cur.fetchone(); cur.close(); con.close()
    if not row:
        return jsonify({"ok": False, "message": "Student not found"}), 404
    for key in ['expiry_date','created_at','profile_created_at','profile_updated_at']:
        if row.get(key): row[key] = row[key].isoformat()
    con = get_db(); cur = con.cursor(dictionary=True)
    courses = get_student_courses(cur, student_id, active_only=True)
    cur.close(); con.close()
    row['courses'] = courses
    row['course_title'] = ', '.join([c.get('title', c.get('key', '')) for c in courses]) or COURSES.get(row['course_key'], {}).get('title', row['course_key'])
    row['profile_completed'] = bool(row.get('profile_completed'))
    return jsonify({"ok": True, "student": row})


@app.route('/api/admin/students/<int:student_id>/profile', methods=['PUT'])
@admin_required
def admin_update_student_profile(student_id):
    data = request.get_json(force=True)
    required = ['full_name','age','gender','mobile_number','email_address','full_address','occupation','why_course','goal_after_course','goal_timeline']
    if not all(str(data.get(k) or '').strip() for k in required):
        return jsonify({"ok": False, "message": "Please fill all profile fields before saving."}), 400
    try:
        age = int(data.get('age'))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "message": "Please enter a valid age."}), 400
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("SELECT id FROM students WHERE id=%s", (student_id,))
        if not cur.fetchone():
            cur.close(); con.close()
            return jsonify({"ok": False, "message": "Student not found"}), 404
        cur.execute("""
            INSERT INTO student_profiles
            (student_id, full_name, age, gender, mobile_number, email_address, full_address, occupation,
             why_course, goal_after_course, goal_timeline, terms_accepted)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1)
            ON DUPLICATE KEY UPDATE
                full_name=VALUES(full_name), age=VALUES(age), gender=VALUES(gender), mobile_number=VALUES(mobile_number),
                email_address=VALUES(email_address), full_address=VALUES(full_address), occupation=VALUES(occupation),
                why_course=VALUES(why_course), goal_after_course=VALUES(goal_after_course), goal_timeline=VALUES(goal_timeline),
                terms_accepted=1
        """, (student_id, data['full_name'].strip(), age, data['gender'].strip(), data['mobile_number'].strip(),
              data['email_address'].strip(), data['full_address'].strip(), data['occupation'].strip(),
              data['why_course'].strip(), data['goal_after_course'].strip(), data['goal_timeline'].strip()))
        cur.execute("UPDATE students SET profile_completed=1 WHERE id=%s", (student_id,))
        con.commit(); cur.close(); con.close()
        return jsonify({"ok": True, "message": "Student information updated successfully"})
    except Error as e:
        return jsonify({"ok": False, "message": str(e)}), 400


@app.route('/api/admin/students/export')
@admin_required
def export_students_excel():
    q = (request.args.get('q') or '').strip()
    params = []
    where = ''
    if q:
        where = "WHERE s.name LIKE %s OR s.phone LIKE %s OR sp.full_name LIKE %s OR sp.mobile_number LIKE %s"
        like = f"%{q}%"; params = [like, like, like, like]
    con = get_db(); cur = con.cursor(dictionary=True)
    cur.execute(f"""
        SELECT s.name,s.phone,s.email,s.username,s.course_key,s.expiry_date,s.is_active,s.profile_completed,s.created_at,
               sp.full_name,sp.age,sp.gender,sp.mobile_number,sp.email_address,sp.full_address,sp.occupation,
               sp.why_course,sp.goal_after_course,sp.goal_timeline,sp.updated_at AS profile_updated_at
        FROM students s
        LEFT JOIN student_profiles sp ON sp.student_id=s.id
        {where}
        ORDER BY s.id DESC
    """, tuple(params))
    rows = cur.fetchall(); cur.close(); con.close()
    headers = [
        'Login Name','Login Phone','Login Email','Username','Purchased Course','Expiry Date','Active','Profile Completed','Registration Date',
        'Full Name','Age','Gender','Mobile Number','Email Address','Full Address','Occupation','Why Course','Goal After Course','Goal Timeline','Profile Updated At'
    ]
    try:
        from openpyxl import Workbook
        wb = Workbook(); ws = wb.active; ws.title = 'Students'
        ws.append(headers)
        for r in rows:
            ws.append([
                r.get('name',''), r.get('phone',''), r.get('email',''), r.get('username',''),
                COURSES.get(r.get('course_key'), {}).get('title', r.get('course_key','')),
                r.get('expiry_date').isoformat() if r.get('expiry_date') else '',
                'Active' if r.get('is_active') else 'Off',
                'Completed' if r.get('profile_completed') else 'Pending',
                r.get('created_at').isoformat() if r.get('created_at') else '',
                r.get('full_name') or '', r.get('age') or '', r.get('gender') or '', r.get('mobile_number') or '',
                r.get('email_address') or '', r.get('full_address') or '', r.get('occupation') or '',
                r.get('why_course') or '', r.get('goal_after_course') or '', r.get('goal_timeline') or '',
                r.get('profile_updated_at').isoformat() if r.get('profile_updated_at') else ''
            ])
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = min(max(len(str(c.value or '')) for c in col) + 2, 45)
        output = BytesIO(); wb.save(output); output.seek(0)
        return send_file(output, as_attachment=True, download_name='sarvathaa_students.xlsx', mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception:
        import csv
        output = BytesIO(); text_stream = output
        rows_text = []
        rows_text.append(','.join(headers))
        for r in rows:
            values = [
                r.get('name',''), r.get('phone',''), r.get('email',''), r.get('username',''),
                COURSES.get(r.get('course_key'), {}).get('title', r.get('course_key','')),
                r.get('expiry_date').isoformat() if r.get('expiry_date') else '',
                'Active' if r.get('is_active') else 'Off',
                'Completed' if r.get('profile_completed') else 'Pending',
                r.get('created_at').isoformat() if r.get('created_at') else '',
                r.get('full_name') or '', r.get('age') or '', r.get('gender') or '', r.get('mobile_number') or '',
                r.get('email_address') or '', r.get('full_address') or '', r.get('occupation') or '',
                r.get('why_course') or '', r.get('goal_after_course') or '', r.get('goal_timeline') or '',
                r.get('profile_updated_at').isoformat() if r.get('profile_updated_at') else ''
            ]
            rows_text.append(','.join('"' + str(v).replace('"','""') + '"' for v in values))
        return Response('\n'.join(rows_text), mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=sarvathaa_students.csv'})


@app.route('/api/admin/students/<int:student_id>', methods=['DELETE'])
@admin_required
def delete_student(student_id):
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("DELETE FROM students WHERE id=%s", (student_id,))
        con.commit()
        affected = cur.rowcount
        cur.close(); con.close()
        if affected == 0:
            return jsonify({"ok": False, "message": "Student not found"}), 404
        return jsonify({"ok": True, "message": "Student deleted successfully"})
    except Error as e:
        return jsonify({"ok": False, "message": str(e)}), 400

@app.route('/api/admin-logout', methods=['GET', 'POST'])
def admin_logout():
    session.pop('admin_logged_in', None)
    return jsonify({"ok": True, "message": "Logged out"})

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='127.0.0.1', port=5000)
