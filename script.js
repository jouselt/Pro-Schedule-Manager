document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let employees = [];
    let shifts = {};
    let previousSchedule = {};
    let templates = {};

    // --- RULES & CONSTANTS ---
    const RULES = {
        MIN_REST_HOURS: 12,
        MAIN_MANAGER_NAME: 'ROYBERTH MENDEZ'
    };

    // --- DOM ELEMENTS ---
    const fileInput = document.getElementById('csv-input');
    const mainTabs = document.querySelector('md-tabs');
    const schedulePanel = document.getElementById('panel-schedule');
    const scheduleContainer = document.getElementById('schedule-container');
    const managerScheduleContainer = document.getElementById('manager-schedule-container');
    const crewScheduleContainer = document.getElementById('crew-schedule-container');
    const countersContainer = document.getElementById('counters-container');
    const templateNameInput = document.getElementById('template-name-input');
    const saveTemplateBtn = document.getElementById('save-template-btn');
    const templateSelect = document.getElementById('template-select');
    const generateFromTemplateBtn = document.getElementById('generate-from-template-btn');
    const editModeSwitch = document.getElementById('edit-mode-switch');
    const compareWeekSwitch = document.getElementById('compare-week-switch');
    const addNewEmployeeBtn = document.getElementById('add-new-employee-btn');
    const employeesCrudTable = document.getElementById('employees-crud-table');
    const employeeDialog = document.getElementById('employee-dialog');
    const employeeForm = document.getElementById('employee-form');
    const exportEmployeesBtn = document.getElementById('export-employees-csv-btn');
    const addNewShiftBtn = document.getElementById('add-new-shift-btn');
    const shiftsCrudTable = document.getElementById('shifts-crud-table');
    const exportShiftsBtn = document.getElementById('export-shifts-csv-btn');
    const shiftDialog = document.getElementById('shift-dialog');
    const shiftForm = document.getElementById('shift-form');
    const exportScheduleCsvBtn = document.getElementById('export-schedule-csv');
    const exportExcelBtn = document.getElementById('export-excel');
    const exportImageBtn = document.getElementById('export-image');
    const exportPdfBtn = document.getElementById('export-pdf');

    // --- LOCAL STORAGE PERSISTENCE ---
    const saveState = () => {
        try {
            localStorage.setItem('scheduler_employees', JSON.stringify(employees));
            localStorage.setItem('scheduler_shifts', JSON.stringify(shifts));
            localStorage.setItem('scheduler_previousSchedule', JSON.stringify(previousSchedule));
            localStorage.setItem('scheduler_templates', JSON.stringify(templates));
        } catch (e) {
            console.error("Error al guardar el estado en localStorage:", e);
            alert("No se pudo guardar el estado actual. El almacenamiento del navegador podría estar lleno o deshabilitado.");
        }
    };

    const loadState = () => {
        try {
            const storedEmployees = localStorage.getItem('scheduler_employees');
            const storedShifts = localStorage.getItem('scheduler_shifts');
            const storedPrevious = localStorage.getItem('scheduler_previousSchedule');
            const storedTemplates = localStorage.getItem('scheduler_templates');
            if (storedEmployees) employees = JSON.parse(storedEmployees);
            if (storedShifts) shifts = JSON.parse(storedShifts);
            if (storedPrevious) previousSchedule = JSON.parse(storedPrevious);
            if (storedTemplates) templates = JSON.parse(storedTemplates);
        } catch (e) {
            console.error("Error al cargar el estado desde localStorage", e);
            employees = []; shifts = {}; previousSchedule = {}; templates = {};
        }
    };

    // --- TEMPLATE MANAGEMENT ---
    const renderTemplateDropdown = () => {
        templateSelect.innerHTML = '';
        const placeholder = document.createElement('md-select-option');
        templateSelect.appendChild(placeholder);
        for (const name in templates) {
            const option = document.createElement('md-select-option');
            option.value = name;
            option.textContent = name;
            templateSelect.appendChild(option);
        }
    };

    const saveTemplate = () => {
        const name = templateNameInput.value.trim();
        if (!name) {
            alert("Por favor, introduce un nombre para la plantilla.");
            return;
        }
        if (employees.length === 0) {
            alert("No se puede guardar un horario vacío como plantilla.");
            return;
        }
        const template = { name: name, requirements: {} };
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        days.forEach((day, dayIndex) => {
            template.requirements[day] = [];
            employees.forEach(emp => {
                const shiftCode = emp.schedule[dayIndex];
                if (shiftCode && shiftCode !== 'Libre') {
                    template.requirements[day].push({ role: emp.Type, shiftCode: shiftCode });
                }
            });
        });
        templates[name] = template;
        saveState();
        renderTemplateDropdown();
        alert(`Plantilla "${name}" guardada!`);
        templateNameInput.value = '';
    };

    // --- AUTOMATIC SCHEDULE GENERATION ---
    const checkRestPeriod = (prevShiftCode, currentShiftCode) => {
        if (!prevShiftCode || prevShiftCode === 'Libre' || !currentShiftCode || currentShiftCode === 'Libre') return true;
        const getTimes = (code) => shifts[code] || (code.includes('-') ? { 'Start Time': code.split('-')[0], 'End Time': code.split('-')[1] } : null);
        const prevShift = getTimes(prevShiftCode);
        const currentShift = getTimes(currentShiftCode);
        if (!prevShift || !currentShift) return true;
        const prevEndTime = parseTime(prevShift['End Time']);
        const currentStartTime = parseTime(currentShift['Start Time']);
        let restMinutes = (24 * 60 - prevEndTime) + currentStartTime;
        if (parseTime(prevShift['Start Time']) > prevEndTime) restMinutes -= 24 * 60;
        return (restMinutes / 60) >= RULES.MIN_REST_HOURS;
    };

    const generateScheduleFromTemplate = () => {
        const templateName = templateSelect.value;
        let templateRequirements;
        if (templateName && templates[templateName]) {
            templateRequirements = templates[templateName].requirements;
        } else {
            if (!confirm("No hay plantilla seleccionada. ¿Usar el horario actual como plantilla para generar una nueva semana?")) return;
            templateRequirements = {};
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            days.forEach((day, dayIndex) => {
                templateRequirements[day] = [];
                employees.forEach(emp => {
                    const shiftCode = emp.schedule[dayIndex];
                    if (shiftCode && shiftCode !== 'Libre') {
                        templateRequirements[day].push({ role: emp.Type, shiftCode: shiftCode });
                    }
                });
            });
        }
        let unassignedShifts = [], employeeHours = {}, employeeAffinity = {}, daysWorked = {};
        employees.forEach(emp => {
            emp.schedule = Array(7).fill('Libre');
            employeeHours[emp.id] = 0;
            employeeAffinity[emp.id] = null;
            daysWorked[emp.id] = 0;
        });
        const mainManager = employees.find(e => e['Employee Name'] === RULES.MAIN_MANAGER_NAME);
        const managerShift = Object.keys(shifts).find(s => s.startsWith('AM') && shifts[s].Category === 'Morning') || 'Libre';
        if (mainManager) {
            for (let i = 0; i < 5; i++) {
                mainManager.schedule[i] = managerShift;
                employeeHours[mainManager.id] += calculateWorkedHours(managerShift);
                daysWorked[mainManager.id]++;
            }
            employeeAffinity[mainManager.id] = 'Morning';
        }
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        days.forEach((day, dayIndex) => {
            const dailyRequirements = templateRequirements[day] || [];
            let assignedToday = new Set();
            if (mainManager && mainManager.schedule[dayIndex] !== 'Libre') assignedToday.add(mainManager.id);
            dailyRequirements.forEach(req => {
                const prevDayShiftIndex = (dayIndex - 1 + 7) % 7;
                let candidates = employees.filter(emp => {
                    const maxWorkDays = emp['Contract Hours'] == 44 ? 5 : 4;
                    return emp.Type === req.role &&
                        emp['Employee Name'] !== RULES.MAIN_MANAGER_NAME &&
                        !assignedToday.has(emp.id) &&
                        daysWorked[emp.id] < maxWorkDays &&
                        checkRestPeriod(emp.schedule[prevDayShiftIndex], req.shiftCode);
                }).sort((a, b) => {
                    const affinityA = employeeAffinity[a.id], affinityB = employeeAffinity[b.id];
                    const requiredCategory = getShiftCategory(req.shiftCode);
                    const scoreA = (affinityA === requiredCategory) ? -1000 : (affinityA === null) ? 0 : 1000;
                    const scoreB = (affinityB === requiredCategory) ? -1000 : (affinityB === null) ? 0 : 1000;
                    if (scoreA !== scoreB) return scoreA - scoreB;
                    return employeeHours[a.id] - employeeHours[b.id];
                });
                if (candidates.length > 0) {
                    const assignedEmployee = candidates[0];
                    assignedEmployee.schedule[dayIndex] = req.shiftCode;
                    employeeHours[assignedEmployee.id] += calculateWorkedHours(req.shiftCode);
                    daysWorked[assignedEmployee.id]++;
                    assignedToday.add(assignedEmployee.id);
                    if (employeeAffinity[assignedEmployee.id] === null) {
                        employeeAffinity[assignedEmployee.id] = getShiftCategory(req.shiftCode);
                    }
                } else {
                    unassignedShifts.push(`- ${day}: ${req.role} para turno ${req.shiftCode}`);
                }
            });
        });
        let finalMessage = "Horario generado con éxito!", overtimeWarnings = [], daysOffWarnings = [];
        employees.forEach(emp => {
            const totalHours = emp.schedule.reduce((acc, shift) => acc + calculateWorkedHours(shift), 0);
            if (totalHours > emp['Contract Hours']) overtimeWarnings.push(`- ADVERTENCIA: ${emp['Employee Name']} se excede por ${(totalHours - emp['Contract Hours']).toFixed(1)} horas.`);
            const requiredDaysOff = emp['Contract Hours'] == 44 ? 2 : 3;
            const actualDaysOff = emp.schedule.filter(s => s === 'Libre').length;
            if (actualDaysOff !== requiredDaysOff) daysOffWarnings.push(`- ADVERTENCIA: ${emp['Employee Name']} tiene ${actualDaysOff} días libres, debería tener ${requiredDaysOff}.`);
        });
        if (unassignedShifts.length > 0) finalMessage += "\n\nNo se pudo asignar:\n" + unassignedShifts.join("\n");
        if (overtimeWarnings.length > 0) finalMessage += "\n\nAdvertencias de horas de contrato:\n" + overtimeWarnings.join("\n");
        if (daysOffWarnings.length > 0) finalMessage += "\n\nAdvertencias de días libres:\n" + daysOffWarnings.join("\n");
        alert(finalMessage);
        renderAll();
        saveState();
    };

    // --- PARSERS & HELPERS ---
    const parseCSV = (text) => {
        const lines = text.trim().split('\n');
        const headers = lines.shift().split(',').map(h => h.trim());
        return lines.map(line => {
            const values = line.split(',').map(v => v.trim());
            let obj = {};
            headers.forEach((header, i) => obj[header] = values[i]);
            return obj;
        });
    };
    const parseTime = (timeStr) => { const [h, m] = (timeStr || "0:0").split(':').map(Number); return h * 60 + (m || 0); };
    const getNextWeekDates = () => {
        const dates = [];
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysUntilMonday = (dayOfWeek === 0) ? 1 : 8 - dayOfWeek;
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + daysUntilMonday);
        for (let i = 0; i < 7; i++) {
            const date = new Date(nextMonday);
            date.setDate(nextMonday.getDate() + i);
            dates.push(date.getDate());
        }
        return dates;
    };
    const downloadCSV = (csvContent, fileName) => {
        const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    const getShiftCategory = (shiftCode) => {
        if (!shiftCode) return 'Custom';
        if (shifts[shiftCode]) return shifts[shiftCode].Category;
        if (shiftCode === 'Libre') return 'Off';
        if (shiftCode.includes('-')) {
            const startHour = parseInt(shiftCode.split('-')[0].split(':')[0], 10);
            if (startHour >= 5 && startHour < 12) return 'Morning';
            if (startHour >= 12 && startHour < 18) return 'Afternoon';
            if (startHour >= 18 || startHour < 5) return 'Night';
        }
        return 'Custom';
    };

    // --- CORE LOGIC ---
    const calculateWorkedHours = (shiftDataOrCode) => {
        let durationHours = 0;
        let shiftData = (typeof shiftDataOrCode === 'string') ? shifts[shiftDataOrCode] : shiftDataOrCode;
        if (shiftData) {
            if (shiftData.Category === 'Off' || !shiftData['Start Time']) return 0;
            const start = parseTime(shiftData['Start Time']);
            const end = parseTime(shiftData['End Time']);
            let durationMinutes = end - start;
            if (durationMinutes < 0) durationMinutes += 24 * 60;
            durationHours = durationMinutes / 60;
        } else if (typeof shiftDataOrCode === 'string' && shiftDataOrCode.includes('-')) {
            const [startStr, endStr] = shiftDataOrCode.split('-');
            const start = parseTime(startStr);
            const end = parseTime(endStr);
            let durationMinutes = end - start;
            if (durationMinutes < 0) durationMinutes += 24 * 60;
            durationHours = durationMinutes / 60;
        }
        return durationHours > 4 ? durationHours - 0.5 : durationHours;
    };

    // --- RENDER FUNCTIONS ---
    const renderAll = () => {
        if (employees.length === 0) {
            scheduleContainer.innerHTML = `<div id="placeholder"><p>Importa un archivo CSV de empleados para comenzar.</p></div>`;
            countersContainer.innerHTML = '';
            return;
        }
        scheduleContainer.querySelector('#placeholder')?.remove();
        renderTable();
        if (Object.keys(shifts).length > 0) {
            renderCounters();
        } else {
            countersContainer.innerHTML = '';
        }
    };

    const renderTable = () => {
        const managers = employees.filter(emp => emp.Type === 'Manager');
        const crew = employees.filter(emp => emp.Type === 'Crew');

        const generateTableHTML = (employeeList, title) => {
            if (employeeList.length === 0) return '';
            const weekDates = getNextWeekDates();
            const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
            let headerHTML = `<tr><th>Empleado</th><th>Contrato</th><th>Total</th>${days.map((day, i) => `<th>${day}<div class="date-header">${weekDates[i]}</div></th>`).join('')}</tr>`;
            let bodyHTML = employeeList.map(emp => {
                const totalHours = emp.schedule.reduce((acc, shift) => acc + calculateWorkedHours(shift), 0);
                const prevWeekSchedule = previousSchedule[emp['Employee Name']];
                const lastWeekNight = prevWeekSchedule && getShiftCategory(prevWeekSchedule[6]) === 'Night';
                const thisWeekNight = emp.schedule[0] && getShiftCategory(emp.schedule[0]) === 'Night';
                const warningIcon = (lastWeekNight && thisWeekNight) ? `<span class="material-symbols-outlined warning-icon" title="Turno de noche después de una semana de turno de noche">warning</span>` : '';
                const shiftCells = emp.schedule.map((shift, dayIndex) => {
                    const shiftData = shifts[shift];
                    const color = shiftData ? shiftData.Color : '#FFFFFF';
                    const optionsHTML = Object.keys(shifts).map(code => `<md-select-option value="${code}" ${code === shift ? 'selected' : ''}>${code}</md-select-option>`).join('');
                    let ctaButton = '';
                    if (!shiftData && shift && shift !== 'Libre') {
                        ctaButton = `<md-icon-button class="add-shift-cta" data-shift-code="${shift}"><span class="material-symbols-outlined">add</span></md-icon-button>`;
                    }
                    let previousShiftHTML = '';
                    if (compareWeekSwitch.selected && prevWeekSchedule) {
                        const prevShift = prevWeekSchedule[dayIndex];
                        previousShiftHTML = `<span class="previous-shift-text">${prevShift || 'N/A'}</span>`;
                    }
                    return `<td style="background-color:${color};">
                        <span class="shift-text">${shift || ''} ${ctaButton}</span>
                        <md-outlined-select class="shift-select" value="${shift}" data-employee-id="${emp.id}" data-day-index="${dayIndex}">${optionsHTML}</md-outlined-select>
                        ${previousShiftHTML}
                    </td>`;
                }).join('');
                return `<tr><td class="employee-name">${warningIcon}${emp['Employee Name']}</td><td>${emp['Contract Hours']}</td><td>${totalHours.toFixed(1)}</td>${shiftCells}</tr>`;
            }).join('');
            return `<h2>${title}</h2><table class="schedule-table"><thead>${headerHTML}</thead><tbody>${bodyHTML}</tbody></table>`;
        };

        managerScheduleContainer.innerHTML = generateTableHTML(managers, 'Gerentes');
        crewScheduleContainer.innerHTML = generateTableHTML(crew, 'Equipo');
    };

    const renderCounters = () => {
        let managerHTML = `<h3>Gerentes</h3><table id="manager-counter-table">`;
        let crewHTML = `<h3>Equipo</h3><table id="crew-counter-table">`;
        const header = `<thead><tr><th>Categoría</th><th>Lun</th><th>Mar</th><th>Mié</th><th>Jue</th><th>Vie</th><th>Sáb</th><th>Dom</th></tr></thead><tbody>`;
        managerHTML += header;
        crewHTML += header;
        const counters = { Manager: {}, Crew: {} };
        ['Morning', 'Afternoon', 'Night', 'Custom', 'Off'].forEach(cat => {
            counters.Manager[cat] = Array(7).fill(0);
            counters.Crew[cat] = Array(7).fill(0);
        });
        employees.forEach(emp => {
            emp.schedule.forEach((shiftCode, dayIndex) => {
                const category = getShiftCategory(shiftCode);
                if (counters[emp.Type]?.[category]) {
                    counters[emp.Type][category][dayIndex]++;
                }
            });
        });
        for (const category in counters.Manager) {
            if (counters.Manager[category].some(c => c > 0)) {
                managerHTML += `<tr><td>${category}</td>${counters.Manager[category].map(c => `<td>${c}</td>`).join('')}</tr>`;
            }
        }
        for (const category in counters.Crew) {
            if (counters.Crew[category].some(c => c > 0)) {
                crewHTML += `<tr><td>${category}</td>${counters.Crew[category].map(c => `<td>${c}</td>`).join('')}</tr>`;
            }
        }
        managerHTML += '</tbody></table>';
        crewHTML += '</tbody></table>';
        countersContainer.innerHTML = managerHTML + crewHTML;
    };

    const renderEmployeeCRUD = () => {
        let html = `<thead><tr><th>Nombre</th><th>Cargo</th><th>Tipo</th><th>Horas</th><th>Acciones</th></tr></thead><tbody>`;
        employees.forEach(emp => {
            html += `<tr>
                <td>${emp['Employee Name']}</td><td>${emp['Title']}</td><td>${emp.Type}</td><td>${emp['Contract Hours']}</td>
                <td>
                    <md-icon-button class="edit-employee-btn" data-id="${emp.id}"><span class="material-symbols-outlined">edit</span></md-icon-button>
                    <md-icon-button class="delete-employee-btn" data-id="${emp.id}"><span class="material-symbols-outlined">delete</span></md-icon-button>
                </td>
            </tr>`;
        });
        html += `</tbody>`;
        employeesCrudTable.innerHTML = html;
    };

    const renderShiftCRUD = () => {
        let html = `<thead><tr><th>Código</th><th>Categoría</th><th>Horario</th><th>Horas</th><th>Color</th><th>Acciones</th></tr></thead><tbody>`;
        Object.values(shifts).forEach(s => {
            html += `<tr>
                <td>${s['Shift Code']}</td><td>${s.Category}</td><td>${s['Start Time']}-${s['End Time']}</td><td>${s['Hours Worked']}</td>
                <td><span class="shift-color-swatch" style="background-color: ${s.Color};"></span></td>
                <td>
                    <md-icon-button class="edit-shift-btn" data-code="${s['Shift Code']}"><span class="material-symbols-outlined">edit</span></md-icon-button>
                    <md-icon-button class="delete-shift-btn" data-code="${s['Shift Code']}"><span class="material-symbols-outlined">delete</span></md-icon-button>
                </td>
            </tr>`;
        });
        html += `</tbody>`;
        shiftsCrudTable.innerHTML = html;
    };

    // --- DIALOG & FORM LOGIC ---
    const openShiftDialog = (shiftCodeToEdit = null) => {
        shiftForm.reset();
        shiftForm.elements.originalCode.value = '';
        if (shiftCodeToEdit) {
            const data = shifts[shiftCodeToEdit];
            shiftForm.elements.originalCode.value = shiftCodeToEdit;
            shiftForm.elements.code.value = data['Shift Code'];
            shiftForm.elements.category.value = data.Category;
            shiftForm.elements.start.value = data['Start Time'];
            shiftForm.elements.end.value = data['End Time'];
            shiftForm.elements.hours.value = calculateWorkedHours(data).toFixed(1);
            shiftForm.elements.color.value = data.Color;
        }
        shiftDialog.show();
    };

    const handleShiftFormSubmit = () => {
        const formData = new FormData(shiftForm);
        const data = Object.fromEntries(formData.entries());
        const originalCode = data.originalCode;
        if (originalCode && originalCode !== data.code) {
            delete shifts[originalCode];
            employees.forEach(emp => {
                emp.schedule = emp.schedule.map(s => s === originalCode ? data.code : s);
            });
        }
        shifts[data.code] = {
            'Shift Code': data.code, Category: data.category, 'Start Time': data.start,
            'End Time': data.end, 'Hours Worked': data.hours, Color: data.color
        };
        if (mainTabs.activeTab.id === 'tab-shifts') renderShiftCRUD();
        renderAll();
        saveState();
    };

    const updateHoursInDialog = () => {
        const start = shiftForm.elements.start.value;
        const end = shiftForm.elements.end.value;
        if (start && end) {
            const tempShiftData = { 'Start Time': start, 'End Time': end };
            shiftForm.elements.hours.value = calculateWorkedHours(tempShiftData).toFixed(1);
        }
    };

    // --- EVENT LISTENERS ---
    document.querySelectorAll('.import-button').forEach(button => {
        button.addEventListener('click', (e) => {
            fileInput.dataset.type = e.currentTarget.dataset.type;
            fileInput.click();
        });
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const data = parseCSV(text);
        const type = e.target.dataset.type;
        if (type === 'employee') {
            employees = data.map((emp, i) => ({ ...emp, id: i, schedule: Array(7).fill('Libre') }));
            if (mainTabs.activeTab.id === 'tab-employees') renderEmployeeCRUD();
        } else if (type === 'shift') {
            shifts = {};
            data.forEach(s => shifts[s['Shift Code']] = s);
            if (mainTabs.activeTab.id === 'tab-shifts') renderShiftCRUD();
        } else if (type === 'schedule') {
            data.forEach(record => {
                const emp = employees.find(e => e['Employee Name'] === record['Employee Name']);
                if (emp) emp.schedule = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => record[day]);
            });
        } else if (type === 'previous-schedule') {
            previousSchedule = {};
            data.forEach(record => {
                previousSchedule[record['Employee Name']] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => record[day]);
            });
        }
        e.target.value = '';
        renderAll();
        saveState();
    });

    mainTabs.addEventListener('change', () => {
        document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
        const activePanelId = mainTabs.activeTab.id.replace('tab-', 'panel-');
        document.getElementById(activePanelId).hidden = false;
        if (activePanelId === 'panel-employees') renderEmployeeCRUD();
        if (activePanelId === 'panel-shifts') renderShiftCRUD();
    });

    editModeSwitch.addEventListener('change', () => {
        schedulePanel.classList.toggle('view-mode', !editModeSwitch.selected);
        schedulePanel.classList.toggle('edit-mode', editModeSwitch.selected);
    });

    compareWeekSwitch.addEventListener('change', renderTable);

    shiftDialog.addEventListener('close', () => { if (shiftDialog.returnValue === 'save') handleShiftFormSubmit(); });
    shiftForm.elements.start.addEventListener('input', updateHoursInDialog);
    shiftForm.elements.end.addEventListener('input', updateHoursInDialog);
    employeeDialog.addEventListener('close', () => {
        if (employeeDialog.returnValue === 'save') {
            const formData = new FormData(employeeForm);
            const data = Object.fromEntries(formData.entries());
            const empIndex = employees.findIndex(e => e.id == data.id);
            if (empIndex > -1) {
                employees[empIndex] = { ...employees[empIndex], ...data };
            }
            renderEmployeeCRUD();
            renderAll();
            saveState();
        }
    });

    scheduleContainer.addEventListener('change', (e) => {
        if (e.target.matches('.shift-select')) {
            const { employeeId, dayIndex } = e.target.dataset;
            employees.find(emp => emp.id == employeeId).schedule[dayIndex] = e.target.value;
            renderAll();
            saveState();
        }
    });

    scheduleContainer.addEventListener('click', (e) => {
        const cta = e.target.closest('.add-shift-cta');
        if (cta) {
            const code = cta.dataset.shiftCode;
            openShiftDialog();
            shiftForm.elements.code.value = code;
            if (code.includes('-')) {
                const [start, end] = code.split('-');
                shiftForm.elements.start.value = start;
                shiftForm.elements.end.value = end;
                updateHoursInDialog();
            }
        }
    });

    employeesCrudTable.addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-employee-btn');
        const deleteBtn = e.target.closest('.delete-employee-btn');
        if (editBtn) {
            const emp = employees.find(e => e.id == editBtn.dataset.id);
            if (emp) {
                employeeForm.reset();
                Object.keys(emp).forEach(key => {
                    if (employeeForm.elements[key]) {
                        employeeForm.elements[key].value = emp[key];
                    }
                });
                employeeDialog.show();
            }
        }
        if (deleteBtn) {
            const empId = deleteBtn.dataset.id;
            const emp = employees.find(e => e.id == empId);
            if (emp && confirm(`¿Estás seguro de que quieres eliminar a ${emp['Employee Name']}?`)) {
                employees = employees.filter(e => e.id != empId);
                renderEmployeeCRUD();
                renderAll();
                saveState();
            }
        }
    });

    shiftsCrudTable.addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-shift-btn');
        const deleteBtn = e.target.closest('.delete-shift-btn');
        if (editBtn) { openShiftDialog(editBtn.dataset.code); }
        if (deleteBtn) {
            const code = deleteBtn.dataset.code;
            if (confirm(`¿Eliminar el turno "${code}"? Todos los turnos asignados se restablecerán a "Libre".`)) {
                delete shifts[code];
                employees.forEach(emp => {
                    emp.schedule = emp.schedule.map(s => s === code ? 'Libre' : s);
                });
                renderShiftCRUD();
                renderAll();
                saveState();
            }
        }
    });

    saveTemplateBtn.addEventListener('click', saveTemplate);
    generateFromTemplateBtn.addEventListener('click', generateScheduleFromTemplate);

    addNewEmployeeBtn.addEventListener('click', () => {
        const name = prompt("Introduce el nombre completo del nuevo empleado:");
        if (!name) return;
        const title = prompt("Introduce el cargo:", "Equipo");
        const type = prompt("Introduce el tipo (Manager o Crew):", "Crew");
        const hours = prompt("Introduce las horas de contrato:", 30);
        employees.push({
            'Employee Name': name, 'Title': title, 'Type': type, 'Contract Hours': hours,
            id: employees.length > 0 ? Math.max(...employees.map(e => e.id)) + 1 : 0,
            schedule: Array(7).fill('Libre')
        });
        renderEmployeeCRUD();
        renderAll();
        saveState();
    });

    addNewShiftBtn.addEventListener('click', () => openShiftDialog());

    if (exportEmployeesBtn) {
        exportEmployeesBtn.addEventListener('click', () => {
            let csvContent = "Employee Name,Title,Type,Contract Hours\r\n";
            employees.forEach(emp => {
                const row = [emp['Employee Name'], emp['Title'], emp['Type'], emp['Contract Hours']].join(',');
                csvContent += row + "\r\n";
            });
            downloadCSV(csvContent, "employees_export.csv");
        });
    }

    if (exportShiftsBtn) {
        exportShiftsBtn.addEventListener('click', () => {
            let csvContent = "Shift Code,Category,Start Time,End Time,Hours Worked,Color\r\n";
            Object.values(shifts).forEach(s => {
                const row = [s['Shift Code'], s.Category, s['Start Time'], s['End Time'], s['Hours Worked'], s.Color].join(',');
                csvContent += row + "\r\n";
            });
            downloadCSV(csvContent, "shifts_export.csv");
        });
    }

    exportScheduleCsvBtn.addEventListener('click', () => {
        let csvContent = "Employee Name,Mon,Tue,Wed,Thu,Fri,Sat,Sun\r\n";
        employees.forEach(emp => { const row = [emp['Employee Name'], ...emp.schedule].join(','); csvContent += row + "\r\n"; });
        downloadCSV(csvContent, "weekly_schedule.csv");
    });

    exportExcelBtn.addEventListener('click', () => {
        // To export both tables, we need to create a custom workbook
        const wb = XLSX.utils.book_new();
        const managerTable = managerScheduleContainer.querySelector('table');
        const crewTable = crewScheduleContainer.querySelector('table');
        if (managerTable) {
            const ws_managers = XLSX.utils.table_to_sheet(managerTable);
            XLSX.utils.book_append_sheet(wb, ws_managers, "Gerentes");
        }
        if (crewTable) {
            const ws_crew = XLSX.utils.table_to_sheet(crewTable);
            XLSX.utils.book_append_sheet(wb, ws_crew, "Equipo");
        }
        XLSX.writeFile(wb, "horario.xlsx");
    });

    exportImageBtn.addEventListener('click', () => {
        const schedule = document.getElementById('schedule-container');
        if (!schedule) return;
        html2canvas(schedule, { scale: 2 }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'horario.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    });

    exportPdfBtn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const schedule = document.getElementById('schedule-container');
        if (!schedule) return;
        html2canvas(schedule, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save('horario.pdf');
        });
    });

    // --- INITIALIZATION ---
    loadState();
    renderAll();
    renderTemplateDropdown();
    schedulePanel.classList.add('view-mode');
    document.getElementById('panel-employees').hidden = true;
    document.getElementById('panel-shifts').hidden = true;

    // --- PWA SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, err => {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }
});
