// app.js

document.addEventListener('DOMContentLoaded', () => {
    // --- НАСТРОЙКИ ---
    // ВНИМАНИЕ: Этот URL должен быть доступен из браузера пользователя, который открывает GitHub Page.
    // Если Grist работает только в вашей локальной сети и не доступен извне, это не сработает.
    const gristBaseUrl = 'http://18.153.125.52:8484'; // Ваш базовый URL Grist
    const docId = 'oHEUL5eSRBwJ'; // Ваш ID Документа Grist
    
    // ВНИМАНИЕ: ХРАНЕНИЕ API-КЛЮЧА В КЛИЕНТСКОМ JAVASCRIPT НЕБЕЗОПАСНО ДЛЯ ПРОДАКТИВА!
    // Этот ключ будет виден любому, кто откроет исходный код страницы.
    // Для реального использования рассмотрите бэкенд-прокси.
    const apiKey = 'd5f1402069843ddf8f04e54ce7efb93818ff2f80'; 

    // ID таблиц в Grist (замените на ваши реальные ID таблиц, если они отличаются)
    // ID таблицы - это то, что вы видите в URL, когда открываете таблицу, или в настройках таблицы.
    const hikesTableApiId = 'Походы';       // API ID таблицы с походами
    const participantsTableApiId = 'Участники'; // API ID таблицы с участниками
    const registrationsTableApiId = 'Регистрации_на_Походы'; // API ID таблицы регистраций

    // Имена колонок (Column ID) в ваших таблицах Grist (замените на ваши реальные ID колонок)
    const hikeNameCol = 'Название_Похода'; // Колонка с названием похода в таблице "Походы"
    const hikeDateCol = 'Дата_Похода';     // Колонка с датой похода в таблице "Походы"
    const hikeStatusCol = 'Статус_Похода'; // Колонка со статусом похода в таблице "Походы"
    const hikeStatusOpenValue = 'Регистрация открыта'; // Значение статуса для доступных походов

    const participantEmailCol = 'Email';
    const participantFirstNameCol = 'Имя';
    const participantLastNameCol = 'Фамилия';
    const participantPhoneCol = 'Телефон';
    const participantCityCol = 'Город';

    const registrationHikeRefCol = 'ID_Похода_Ref';     // Колонка Reference на Походы в таблице Регистраций
    const registrationParticipantRefCol = 'ID_Участника_Ref'; // Колонка Reference на Участники в таблице Регистраций
    // --- КОНЕЦ НАСТРОЕК ---

    const hikeSelect = document.getElementById('hike');
    const registrationForm = document.getElementById('registration-form');
    const messageArea = document.getElementById('message-area');
    const loadingHikesDiv = document.getElementById('loading-hikes');
    const submitButton = document.getElementById('submit-button');

    // Функция для выполнения запросов к Grist API
    async function gristRequest(endpoint, method = 'GET', body = null) {
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const fullUrl = `${gristBaseUrl}/api/docs/${docId}/${endpoint}`;
        console.log(`Отправка запроса: ${method} ${fullUrl}`, body ? `с телом: ${JSON.stringify(body)}` : '');

        try {
            const response = await fetch(fullUrl, options);
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: await response.text() };
                }
                console.error('Ошибка Grist API:', response.status, errorData);
                throw new Error(`Ошибка Grist API: ${response.status} - ${errorData.error || JSON.stringify(errorData)}`);
            }
            if (response.status === 204) { // No Content
                return { success: true };
            }
            return await response.json();
        } catch (error) {
            console.error('Сетевая ошибка или ошибка парсинга JSON:', error);
            messageArea.textContent = `Критическая ошибка: ${error.message}. Проверьте консоль.`;
            messageArea.className = 'message error';
            throw error;
        }
    }

    // 1. Загрузка списка походов
    async function loadHikes() {
        try {
            const filter = {};
            filter[hikeStatusCol] = [hikeStatusOpenValue]; // Фильтр по статусу
            const encodedFilter = encodeURIComponent(JSON.stringify(filter));
            
            const data = await gristRequest(`tables/${hikesTableApiId}/records?filter=${encodedFilter}`);
            
            loadingHikesDiv.style.display = 'none';
            registrationForm.style.display = 'block';

            if (data && data.records && data.records.length > 0) {
                hikeSelect.innerHTML = '<option value="">-- Выберите поход --</option>'; // Placeholder
                data.records.forEach(record => {
                    const option = document.createElement('option');
                    option.value = record.id; // ID строки похода (Grist row ID)
                    option.textContent = `${record.fields[hikeNameCol] || 'Поход без названия'} (${record.fields[hikeDateCol] || 'Дата не указана'})`;
                    hikeSelect.appendChild(option);
                });
            } else {
                hikeSelect.innerHTML = '<option value="">Нет доступных походов для регистрации</option>';
                submitButton.disabled = true;
            }
        } catch (error) {
            loadingHikesDiv.textContent = 'Не удалось загрузить список походов. Попробуйте обновить страницу.';
            loadingHikesDiv.className = 'message error';
            console.error('Failed to load hikes:', error);
        }
    }

    // 2. Обработка отправки формы
    registrationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        messageArea.textContent = 'Обработка регистрации...';
        messageArea.className = 'message info';
        submitButton.disabled = true;

        const formData = new FormData(registrationForm);
        const email = formData.get('email').trim();
        const firstName = formData.get('firstName').trim();
        const lastName = formData.get('lastName').trim();
        const phone = formData.get('phone').trim();
        const city = formData.get('city').trim();
        const selectedHikeRowId = parseInt(hikeSelect.value, 10);

        if (!selectedHikeRowId) {
            messageArea.textContent = 'Пожалуйста, выберите поход.';
            messageArea.className = 'message error';
            submitButton.disabled = false;
            return;
        }

        try {
            // Шаг 2.1: Найти или создать участника
            let participantRowId;
            const participantFilter = {};
            participantFilter[participantEmailCol] = [email];
            const encodedParticipantFilter = encodeURIComponent(JSON.stringify(participantFilter));
            
            const existingParticipants = await gristRequest(`tables/${participantsTableApiId}/records?filter=${encodedParticipantFilter}`);

            if (existingParticipants && existingParticipants.records && existingParticipants.records.length > 0) {
                participantRowId = existingParticipants.records[0].id;
                console.log(`Найден существующий участник с ID: ${participantRowId}`);
                // Опционально: обновить данные участника
                await gristRequest(`tables/${participantsTableApiId}/records`, 'PATCH', {
                    records: [{
                        id: participantRowId,
                        fields: {
                            [participantFirstNameCol]: firstName,
                            [participantLastNameCol]: lastName,
                            [participantPhoneCol]: phone,
                            [participantCityCol]: city
                        }
                    }]
                });
                messageArea.textContent = 'Данные участника обновлены. ';
            } else {
                console.log(`Участник с email ${email} не найден, создаем нового.`);
                const newParticipantPayload = {
                    records: [{
                        fields: {
                            [participantEmailCol]: email,
                            [participantFirstNameCol]: firstName,
                            [participantLastNameCol]: lastName,
                            [participantPhoneCol]: phone,
                            [participantCityCol]: city
                        }
                    }]
                };
                const newParticipantData = await gristRequest(`tables/${participantsTableApiId}/records`, 'POST', newParticipantPayload);
                
                // Ответ Grist на POST /records может быть { "records": [{ "id": NEW_ROW_ID }] } или просто [NEW_ROW_ID]
                if (newParticipantData && newParticipantData.records && newParticipantData.records.length > 0 && newParticipantData.records[0].id) {
                    participantRowId = newParticipantData.records[0].id;
                } else if (Array.isArray(newParticipantData) && newParticipantData.length > 0 && typeof newParticipantData[0] === 'number') { 
                    participantRowId = newParticipantData[0];
                } else {
                    console.error("Не удалось получить ID нового участника:", newParticipantData);
                    throw new Error('Не удалось создать профиль участника. Ответ API: ' + JSON.stringify(newParticipantData));
                }
                console.log(`Создан новый участник с ID: ${participantRowId}`);
                messageArea.textContent = 'Профиль участника создан. ';
            }

            // Шаг 2.2: Зарегистрировать участника на поход
            const registrationFilter = {};
            registrationFilter[registrationHikeRefCol] = [selectedHikeRowId];
            registrationFilter[registrationParticipantRefCol] = [participantRowId]; // Для Reference колонок значением должен быть ID строки
            const encodedRegFilter = encodeURIComponent(JSON.stringify(registrationFilter));

            const existingRegistrations = await gristRequest(`tables/${registrationsTableApiId}/records?filter=${encodedRegFilter}`);

            if (existingRegistrations && existingRegistrations.records && existingRegistrations.records.length > 0) {
                messageArea.textContent += 'Вы уже зарегистрированы на этот поход!';
                messageArea.className = 'message warning';
            } else {
                const registrationPayload = {
                    records: [{
                        fields: {
                            [registrationHikeRefCol]: selectedHikeRowId, 
                            [registrationParticipantRefCol]: participantRowId
                        }
                    }]
                };
                await gristRequest(`tables/${registrationsTableApiId}/records`, 'POST', registrationPayload);
                messageArea.textContent += 'Вы успешно зарегистрированы на поход!';
                messageArea.className = 'message success';
                registrationForm.reset();
            }

        } catch (error) {
            // Ошибка уже должна быть отображена gristRequest функцией или здесь
            messageArea.textContent = `Ошибка регистрации: ${error.message}`;
            messageArea.className = 'message error';
            console.error('Registration process failed:', error);
        } finally {
            submitButton.disabled = false;
        }
    });

    // Инициализация
    loadHikes();
});

