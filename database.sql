CREATE DATABASE IF NOT EXISTS sarvathaa_courses CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sarvathaa_courses;

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
);

CREATE TABLE IF NOT EXISTS student_courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_key VARCHAR(80) NOT NULL,
  expiry_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_course (student_id, course_key),
  CONSTRAINT fk_student_course_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

INSERT IGNORE INTO student_courses (student_id, course_key, expiry_date, is_active, created_at)
SELECT id, course_key, expiry_date, is_active, created_at FROM students;

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
);

-- Coupon code control table
CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default 10% coupon for 6 months from setup date
INSERT IGNORE INTO coupons
(code, discount_type, discount_value, start_date, expiry_date, is_active)
VALUES
('SARVATHAA10', 'percent', 10, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 6 MONTH), TRUE);


-- Course purchase requests submitted from Silver / Gold / Platinum buy forms
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
);
