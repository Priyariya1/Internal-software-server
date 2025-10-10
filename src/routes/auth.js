import express from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js'; // 👈 Import the User model
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ✅ Register new user (Corrected)
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    // 1. Validation
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // 2. Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // 3. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt rounds

    // 4. Create the new user in the database
    // ❗ IMPORTANT: You need to modify your User.create method to handle the password.
    // I'll show you how below this code block.
    const userId = await User.create({ 
      email, 
      password: hashedPassword, 
      full_name 
    });

    // 5. Fetch the newly created user to get all details (like role)
    const newUser = await User.findById(userId);

    // 6. Generate a real JWT
    const token = User.generateToken(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Login user (Corrected)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // 2. Find the user by email
    const user = await User.findByEmail(email);
    if (!user) {
      // Use a generic message for security
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await User.verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 4. Generate a real JWT
    const token = User.generateToken(user);
    
    // 5. Send response (don't send the password back)
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// This route is mostly fine, but let's select specific fields
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // req.user is already populated by the authenticateToken middleware
    const user = req.user; 
    
    res.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: user.role,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// This route is fine as is
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;