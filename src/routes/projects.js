import express from 'express';
import { Project } from '../models/Project.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get all projects (with pagination) — temporarily public for dashboard
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let projects;
    let total;

    if (status) {
      projects = await Project.findByStatus(status, limit, offset);
      total = projects.length;
    } else {
      projects = await Project.findAll(limit, offset);
      total = await Project.count();
    }

    res.json({
      projects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get project by ID — temporarily public for dashboard
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get project assignments
    const assignments = await Project.getProjectAssignments(id);
    project.assignments = assignments;

    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new project (admin/manager only)
router.post('/', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const projectData = {
      ...req.body,
      created_by: req.user.id
    };

    const projectId = await Project.create(projectData);
    const project = await Project.findById(projectId);

    res.status(201).json({
      message: 'Project created successfully',
      project
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update project (admin/manager only)
router.put('/:id', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = await Project.update(id, updates);
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await Project.findById(id);
    res.json({
      message: 'Project updated successfully',
      project
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete project (admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const success = await Project.delete(id);

    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign employee to project
router.post('/:id/assign', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { employee_id, role } = req.body;

    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    const assignmentId = await Project.assignEmployee(projectId, employee_id, role);
    
    res.status(201).json({
      message: 'Employee assigned to project successfully',
      assignment_id: assignmentId
    });
  } catch (error) {
    console.error('Assign employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove employee from project
router.delete('/:id/assign/:employee_id', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id: projectId, employee_id } = req.params;
    const success = await Project.removeEmployeeAssignment(projectId, employee_id);

    if (!success) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ message: 'Employee removed from project successfully' });
  } catch (error) {
    console.error('Remove employee assignment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
