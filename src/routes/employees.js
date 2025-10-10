import express from 'express';
import { Employee } from '../models/Employee.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get all employees (with pagination) — temporarily public for dashboard
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const department = req.query.department;

    let employees;
    let total;

    if (department) {
      employees = await Employee.findByDepartment(department, limit, offset);
      total = employees.length;
    } else {
      employees = await Employee.findAll(limit, offset);
      total = await Employee.count();
    }

    res.json({
      employees,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get employee by ID — temporarily public for dashboard
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new employee (admin/manager only)
router.post('/', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const employeeData = {
      ...req.body,
      created_by: req.user.id
    };

    const employeeId = await Employee.create(employeeData);
    const employee = await Employee.findById(employeeId);

    res.status(201).json({
      message: 'Employee created successfully',
      employee
    });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update employee (admin/manager only)
router.put('/:id', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = await Employee.update(id, updates);
    if (!success) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = await Employee.findById(id);
    res.json({
      message: 'Employee updated successfully',
      employee
    });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete employee (admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const success = await Employee.delete(id);

    if (!success) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
